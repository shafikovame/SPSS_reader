import asyncio
import io
import os
import re
import tempfile
import time
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
import pyreadstat
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles


MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", str(100 * 1024 * 1024)))
FILE_TTL = int(os.getenv("FILE_TTL", "3600"))
STATIC_DIR = Path(__file__).parent / "static"


class DatasetStore:
    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def put(self, payload: dict[str, Any]) -> str:
        dataset_id = str(uuid.uuid4())
        async with self._lock:
            self._store[dataset_id] = payload
        return dataset_id

    async def get(self, dataset_id: str) -> dict[str, Any]:
        async with self._lock:
            dataset = self._store.get(dataset_id)
        if dataset is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        return dataset

    async def cleanup(self) -> None:
        now = time.time()
        async with self._lock:
            expired = [
                dataset_id
                for dataset_id, value in self._store.items()
                if now - value["created_at"] > FILE_TTL
            ]
            for dataset_id in expired:
                del self._store[dataset_id]


store = DatasetStore()
app = FastAPI(title="SPSS Viewer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cell_for_excel(value: Any) -> Any:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value
    return value


def _prepare_dataframe_for_excel(dataframe: pd.DataFrame) -> pd.DataFrame:
    out = dataframe.copy()
    out.insert(0, "Case", range(1, len(out) + 1))
    for column in out.columns:
        if column == "Case":
            continue
        out[column] = out[column].map(_cell_for_excel)
    return out


def _variables_structure_dataframe(variables: list[dict[str, Any]]) -> pd.DataFrame:
    rows = [
        {
            "Имя": item.get("name", ""),
            "Тип": item.get("type", ""),
            "Метка": item.get("label", ""),
            "Значения": item.get("values", ""),
            "Пропущенные": item.get("missing", ""),
            "Шкала": item.get("scale", ""),
        }
        for item in variables
    ]
    return pd.DataFrame(rows)


def _safe_download_basename(filename: str) -> str:
    stem = Path(filename).stem
    cleaned = re.sub(r"[^\w\s.-]", "_", stem, flags=re.UNICODE).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned or "export"


def _normalize_cell(value: Any) -> Any:
    if value is None:
        return None
    if pd.isna(value):
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _format_value_labels(value_labels: dict[Any, Any]) -> str:
    if not value_labels:
        return ""
    lines: list[str] = []
    for raw_value, label in value_labels.items():
        lines.append(f"{raw_value} = {label}")
    return "\n".join(lines)


def _extract_missing(meta: pyreadstat.metadata_container, variable: str) -> str:
    ranges = (meta.missing_ranges or {}).get(variable, [])
    user_values = (meta.missing_user_values or {}).get(variable, [])
    parts: list[str] = []

    for item in ranges:
        lo = item.get("lo")
        hi = item.get("hi")
        if lo is not None and hi is not None and lo != hi:
            parts.append(f"{lo}..{hi}")
        elif lo is not None:
            parts.append(str(lo))
        elif hi is not None:
            parts.append(str(hi))

    for item in user_values:
        parts.append(str(item))

    return ", ".join(parts)


def _map_variable_type(
    variable: str,
    original_type: str,
    readstat_type: str,
) -> str:
    if readstat_type == "string":
        return "String"

    marker = (original_type or "").upper()
    if "DATE" in marker or "TIME" in marker:
        return "Date"
    if marker.startswith("A"):
        return "String"
    if readstat_type in ("double", "integer"):
        return "Numeric"
    return original_type or "Unknown"


def _build_variable_metadata(meta: pyreadstat.metadata_container) -> list[dict[str, Any]]:
    variables: list[dict[str, Any]] = []
    column_names = meta.column_names or []
    labels = meta.column_labels or []
    variable_to_label = meta.variable_to_label or {}
    label_sets = meta.value_labels or {}
    variable_measure = meta.variable_measure or {}
    original_types = meta.original_variable_types or {}
    readstat_types = meta.readstat_variable_types or {}

    for idx, variable in enumerate(column_names):
        label_set_name = variable_to_label.get(variable)
        value_labels = label_sets.get(label_set_name, {})
        label = labels[idx] if idx < len(labels) and labels[idx] is not None else ""
        scale = variable_measure.get(variable) or "Unknown"
        if isinstance(scale, str):
            scale = scale.lower() if scale else "Unknown"
        else:
            scale = "Unknown"

        variables.append(
            {
                "name": variable,
                "type": _map_variable_type(
                    variable=variable,
                    original_type=original_types.get(variable, ""),
                    readstat_type=readstat_types.get(variable, ""),
                ),
                "label": label,
                "values": _format_value_labels(value_labels),
                "missing": _extract_missing(meta, variable),
                "scale": scale if scale else "Unknown",
            }
        )
    return variables


def _slice_rows(
    dataframe: pd.DataFrame,
    offset: int,
    limit: int,
) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    sliced = dataframe.iloc[offset : offset + limit]
    rows: list[dict[str, Any]] = []

    for position, (_, row) in enumerate(sliced.iterrows(), start=offset + 1):
        normalized = {column: _normalize_cell(value) for column, value in row.items()}
        normalized["_case_number"] = position
        rows.append(normalized)

    return rows


def _load_sav_from_bytes(contents: bytes) -> tuple[pd.DataFrame, pd.DataFrame, list[dict[str, Any]]]:
    with tempfile.NamedTemporaryFile(suffix=".sav", delete=False) as temp_file:
        temp_file.write(contents)
        temp_path = temp_file.name
    try:
        values_df, meta = pyreadstat.read_sav(
            temp_path,
            apply_value_formats=False,
            user_missing=True,
        )
        labels_df, _ = pyreadstat.read_sav(
            temp_path,
            apply_value_formats=True,
            user_missing=True,
        )
        variables_metadata = _build_variable_metadata(meta)
        return values_df, labels_df, variables_metadata
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read .sav: {exc}") from exc
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def _excel_response_for_sav(
    values_df: pd.DataFrame,
    labels_df: pd.DataFrame,
    variables_metadata: list[dict[str, Any]],
    source_filename: str,
) -> Response:
    values_sheet = _prepare_dataframe_for_excel(values_df)
    labels_sheet = _prepare_dataframe_for_excel(labels_df)
    structure_sheet = _variables_structure_dataframe(variables_metadata)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        values_sheet.to_excel(writer, sheet_name="values", index=False)
        labels_sheet.to_excel(writer, sheet_name="labels", index=False)
        structure_sheet.to_excel(writer, sheet_name="структура переменных", index=False)
    download_name = f"{_safe_download_basename(source_filename)}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


async def _ttl_worker() -> None:
    while True:
        await asyncio.sleep(60)
        await store.cleanup()


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(_ttl_worker())


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/upload")
async def upload_sav(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    if not file.filename.lower().endswith(".sav"):
        raise HTTPException(status_code=400, detail="Only .sav files are allowed")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds MAX_FILE_SIZE ({MAX_FILE_SIZE} bytes)",
        )

    values_df, labels_df, variables_metadata = _load_sav_from_bytes(contents)

    payload = {
        "created_at": time.time(),
        "filename": file.filename,
        "rows_count": int(values_df.shape[0]),
        "variables_count": int(values_df.shape[1]),
        "columns": list(values_df.columns),
        "values_df": values_df,
        "labels_df": labels_df,
        "variables_metadata": variables_metadata,
    }
    dataset_id = await store.put(payload)
    return {"id": dataset_id}


@app.post("/api/sav-to-xlsx")
async def sav_to_xlsx(file: UploadFile = File(...)) -> Response:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    if not file.filename.lower().endswith(".sav"):
        raise HTTPException(status_code=400, detail="Only .sav files are allowed")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds MAX_FILE_SIZE ({MAX_FILE_SIZE} bytes)",
        )

    values_df, labels_df, variables_metadata = _load_sav_from_bytes(contents)
    return _excel_response_for_sav(values_df, labels_df, variables_metadata, file.filename)


@app.get("/api/dataset/{dataset_id}/summary")
async def dataset_summary(dataset_id: str) -> dict[str, Any]:
    dataset = await store.get(dataset_id)
    return {
        "id": dataset_id,
        "filename": dataset["filename"],
        "rows": dataset["rows_count"],
        "variables": dataset["variables_count"],
    }


@app.get("/api/dataset/{dataset_id}/data")
async def dataset_data(
    dataset_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    mode: str = Query(default="values", pattern="^(values|labels)$"),
) -> dict[str, Any]:
    dataset = await store.get(dataset_id)
    dataframe = dataset["labels_df"] if mode == "labels" else dataset["values_df"]
    total_rows = dataset["rows_count"]
    rows = _slice_rows(dataframe, offset=offset, limit=min(limit, total_rows - offset))
    return {
        "columns": dataset["columns"],
        "offset": offset,
        "limit": limit,
        "total_rows": total_rows,
        "rows": rows,
    }


@app.get("/api/dataset/{dataset_id}/variables")
async def dataset_variables(dataset_id: str) -> dict[str, Any]:
    dataset = await store.get(dataset_id)
    return {"variables": dataset["variables_metadata"]}


@app.get("/api/dataset/{dataset_id}/export.xlsx")
async def export_dataset_excel(dataset_id: str) -> Response:
    dataset = await store.get(dataset_id)
    return _excel_response_for_sav(
        dataset["values_df"],
        dataset["labels_df"],
        dataset["variables_metadata"],
        dataset["filename"],
    )


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR, html=True), name="static")


def _spa_index_response() -> FileResponse:
    index_file = STATIC_DIR / "index.html"
    return FileResponse(
        path=str(index_file),
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@app.get("/")
async def spa_root() -> Any:
    if not (STATIC_DIR / "index.html").exists():
        return {"message": "Frontend is not built yet"}
    return _spa_index_response()


@app.get("/{path:path}")
async def spa_fallback(path: str) -> Any:
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return _spa_index_response()
    return {"message": "Frontend is not built yet"}
