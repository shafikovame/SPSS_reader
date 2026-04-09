export type ViewMode = "values" | "labels";

export interface SummaryResponse {
  id: string;
  filename: string;
  rows: number;
  variables: number;
}

export interface DataResponse {
  columns: string[];
  offset: number;
  limit: number;
  total_rows: number;
  rows: Record<string, unknown>[];
}

export interface VariableMetadata {
  name: string;
  type: string;
  label: string;
  values: string;
  missing: string;
  scale: string;
}

const jsonHeaders = {
  Accept: "application/json",
};

export async function uploadSav(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/upload", {
    method: "POST",
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload failed");
  }
  const payload = (await response.json()) as { id: string };
  return payload.id;
}

export async function getSummary(datasetId: string): Promise<SummaryResponse> {
  const response = await fetch(`/api/dataset/${datasetId}/summary`, {
    headers: jsonHeaders,
  });
  if (!response.ok) {
    throw new Error("Failed to load dataset summary");
  }
  return (await response.json()) as SummaryResponse;
}

export async function getData(
  datasetId: string,
  offset: number,
  limit: number,
  mode: ViewMode,
): Promise<DataResponse> {
  const response = await fetch(
    `/api/dataset/${datasetId}/data?offset=${offset}&limit=${limit}&mode=${mode}`,
    {
      headers: jsonHeaders,
    },
  );
  if (!response.ok) {
    throw new Error("Failed to load data");
  }
  return (await response.json()) as DataResponse;
}

export async function getVariables(datasetId: string): Promise<VariableMetadata[]> {
  const response = await fetch(`/api/dataset/${datasetId}/variables`, {
    headers: jsonHeaders,
  });
  if (!response.ok) {
    throw new Error("Failed to load variable metadata");
  }
  const payload = (await response.json()) as { variables: VariableMetadata[] };
  return payload.variables;
}

export async function downloadExcelExport(datasetId: string, sourceFilename: string): Promise<void> {
  const response = await fetch(`/api/dataset/${datasetId}/export.xlsx`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Export failed");
  }
  const blob = await response.blob();
  let filename = sourceFilename.replace(/\.sav$/i, ".xlsx");
  const contentDisposition = response.headers.get("Content-Disposition");
  if (contentDisposition) {
    const match = /filename="([^"]+)"/i.exec(contentDisposition);
    if (match?.[1]) {
      filename = match[1];
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
