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

  function playClickSound() {
    const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(520, audioContext.currentTime + 0.05);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.06);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.065);
  }

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
    <div className="homm-ui mx-auto flex h-screen w-full max-w-[1800px] flex-col gap-4 p-4">
      <header className="homm-panel rounded-md p-4 shadow-sm">
        <h1 className="homm-title text-xl font-semibold uppercase tracking-wide">SPSS Viewer</h1>
        <p className="homm-subtext mt-1 text-sm">
          Просмотр содержимого и метаданных SPSS .sav без интерпретации. После загрузки файла можно скачать Excel с
          листами values, labels и структура переменных.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="homm-button rounded px-3 py-2 text-sm font-medium" onClick={playClickSound}>
            Upload .sav
            <input type="file" className="hidden" accept=".sav" onChange={handleUpload} />
          </label>
          <button
            className={`rounded border-2 px-4 py-2 text-sm font-semibold shadow-sm ${
              canExportExcel && !exporting
                ? "homm-button"
                : "cursor-not-allowed border-stone-500 bg-stone-700/70 text-stone-400"
            }`}
            disabled={!canExportExcel || exporting}
            onClick={() => {
              playClickSound();
              void handleExportExcel();
            }}
            title={
              canExportExcel
                ? "Скачать .xlsx: листы values, labels, структура переменных"
                : "Сначала загрузите файл .sav — затем нажмите снова"
            }
            type="button"
          >
            {exporting ? "Экспорт…" : "Скачать Excel (.xlsx)"}
          </button>
          {loading && <span className="homm-loading text-sm">Loading...</span>}
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>
      </header>

      {summary && (
        <section className="homm-panel rounded-md p-3 shadow-sm">
          <div className="homm-subtext flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-amber-700/50 pb-3 text-sm">
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={`rounded px-3 py-1.5 text-sm ${activeTab === "data" ? "homm-button" : "homm-button-muted"}`}
              onClick={() => {
                playClickSound();
                setActiveTab("data");
              }}
              type="button"
            >
              Данные
            </button>
            <button
              className={`rounded px-3 py-1.5 text-sm ${activeTab === "variables" ? "homm-button" : "homm-button-muted"}`}
              onClick={() => {
                playClickSound();
                setActiveTab("variables");
              }}
              type="button"
            >
              Структура переменных
            </button>
            {activeTab === "data" && (
              <div className="ml-4 flex items-center gap-2">
                <button
                  className={`rounded px-3 py-1.5 text-sm ${mode === "values" ? "homm-button" : "homm-button-muted"}`}
                  onClick={() => {
                    playClickSound();
                    setMode("values");
                  }}
                  type="button"
                >
                  Values
                </button>
                <button
                  className={`rounded px-3 py-1.5 text-sm ${mode === "labels" ? "homm-button" : "homm-button-muted"}`}
                  onClick={() => {
                    playClickSound();
                    setMode("labels");
                  }}
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
          <div className="homm-panel homm-subtext flex h-full flex-col items-center justify-center gap-4 rounded-md p-6 text-center shadow-sm">
            <p>Загрузите .sav файл для просмотра и экспорта.</p>
            <p className="max-w-md text-sm">
              После загрузки .xlsx можно скачать кнопкой «Скачать Excel (.xlsx)» рядом с Upload.
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
