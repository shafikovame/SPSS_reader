import { useState } from "react";
import {
  downloadExcelExport,
  getSummary,
  getVariables,
  uploadSav,
  type SummaryResponse,
  type VariableMetadata,
  type ViewMode,
} from "./api";
import { DataView } from "./components/DataView";
import { VariableView } from "./components/VariableView";

type Tab = "data" | "variables";

export default function App() {
  const [datasetId, setDatasetId] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [variables, setVariables] = useState<VariableMetadata[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("data");
  const [mode, setMode] = useState<ViewMode>("values");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const id = await uploadSav(file);
      const [summaryPayload, variablesPayload] = await Promise.all([
        getSummary(id),
        getVariables(id),
      ]);
      setDatasetId(id);
      setSummary(summaryPayload);
      setVariables(variablesPayload);
      setActiveTab("data");
      setMode("values");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  const canExportExcel = Boolean(datasetId && summary);

  async function handleExportExcel() {
    if (!datasetId || !summary) {
      return;
    }
    setExporting(true);
    setError("");
    try {
      await downloadExcelExport(datasetId, summary.filename);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto flex h-screen w-full max-w-[1800px] flex-col gap-4 p-4">
      <header className="rounded-md bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold">SPSS Viewer</h1>
        <p className="mt-1 text-sm text-slate-600">
          Просмотр содержимого и метаданных SPSS .sav без интерпретации. Экспорт в Excel (листы values, labels,
          структура переменных) — кнопка ниже; после загрузки .sav она станет активной.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white">
            Upload .sav
            <input type="file" className="hidden" accept=".sav" onChange={handleUpload} />
          </label>
          <button
            className={`rounded border-2 px-4 py-2 text-sm font-semibold shadow-sm ${
              canExportExcel && !exporting
                ? "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
                : "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
            }`}
            disabled={!canExportExcel || exporting}
            onClick={() => void handleExportExcel()}
            title={
              canExportExcel
                ? "Скачать .xlsx: листы values, labels, структура переменных"
                : "Сначала загрузите файл .sav — затем нажмите снова"
            }
            type="button"
          >
            {exporting ? "Экспорт…" : "Скачать Excel (.xlsx)"}
          </button>
          {loading && <span className="text-sm text-slate-600">Loading...</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </header>

      {summary && (
        <section className="rounded-md bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 text-sm">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              <span className="min-w-0 break-all">
                <strong>Файл:</strong> {summary.filename}
              </span>
              <span>
                <strong>Строки:</strong> {summary.rows}
              </span>
              <span>
                <strong>Переменные:</strong> {summary.variables}
              </span>
            </div>
            <button
              className={`shrink-0 rounded-md px-4 py-2 text-sm font-bold shadow-md ring-2 ring-offset-2 ${
                canExportExcel && !exporting
                  ? "bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-500 ring-slate-300"
              }`}
              disabled={!canExportExcel || exporting}
              onClick={() => void handleExportExcel()}
              title="Скачать Excel: листы values, labels, структура переменных"
              type="button"
            >
              {exporting ? "Экспорт…" : "Скачать Excel"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={`rounded px-3 py-1.5 text-sm ${activeTab === "data" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => setActiveTab("data")}
              type="button"
            >
              Данные
            </button>
            <button
              className={`rounded px-3 py-1.5 text-sm ${activeTab === "variables" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => setActiveTab("variables")}
              type="button"
            >
              Структура переменных
            </button>
            {activeTab === "data" && (
              <div className="ml-4 flex items-center gap-2">
                <button
                  className={`rounded px-3 py-1.5 text-sm ${mode === "values" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}
                  onClick={() => setMode("values")}
                  type="button"
                >
                  Values
                </button>
                <button
                  className={`rounded px-3 py-1.5 text-sm ${mode === "labels" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}
                  onClick={() => setMode("labels")}
                  type="button"
                >
                  Labels
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <main className="min-h-0 flex-1">
        {!summary && (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-md bg-white p-6 text-center text-slate-500 shadow-sm">
            <p>Загрузите .sav файл для просмотра и экспорта.</p>
            <p className="max-w-md text-sm text-slate-600">
              Кнопка «Скачать Excel (.xlsx)» в шапке станет активной сразу после успешной загрузки — одинаково для
              всех пользователей этой страницы.
            </p>
          </div>
        )}
        {summary && activeTab === "data" && (
          <DataView datasetId={datasetId} summary={summary} mode={mode} />
        )}
        {summary && activeTab === "variables" && <VariableView variables={variables} />}
      </main>
    </div>
  );
}
