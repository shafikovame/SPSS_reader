import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getData, type SummaryResponse, type ViewMode } from "../api";

const PAGE_SIZE = 300;
const ROW_HEIGHT = 36;

interface DataViewProps {
  datasetId: string;
  summary: SummaryResponse;
  mode: ViewMode;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function DataView({ datasetId, summary, mode }: DataViewProps) {
  const [columns, setColumns] = useState<string[]>([]);
  const [rowCache, setRowCache] = useState<Map<number, Record<string, unknown>>>(new Map());
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());
  const [loadingPage, setLoadingPage] = useState<Set<number>>(new Set());
  const [variableSearch, setVariableSearch] = useState("");
  const [caseFilter, setCaseFilter] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRowCache(new Map());
    setLoadedPages(new Set());
    setLoadingPage(new Set());
  }, [datasetId, mode]);

  const filteredColumns = useMemo(() => {
    const search = variableSearch.trim().toLowerCase();
    if (!search) {
      return columns;
    }
    return columns.filter((name) => name.toLowerCase().includes(search));
  }, [columns, variableSearch]);

  const totalRows = summary.rows;
  const parsedCase = Number.parseInt(caseFilter, 10);
  const hasCaseFilter = caseFilter.trim().length > 0 && Number.isInteger(parsedCase);
  const viewRowsCount = hasCaseFilter && parsedCase > 0 && parsedCase <= totalRows ? 1 : totalRows;

  const rowVirtualizer = useVirtualizer({
    count: viewRowsCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    if (virtualItems.length === 0) {
      return;
    }
    const first = virtualItems[0].index;
    const last = virtualItems[virtualItems.length - 1].index;
    const requestedIndexes: number[] = [];

    if (hasCaseFilter && parsedCase > 0 && parsedCase <= totalRows) {
      requestedIndexes.push(parsedCase - 1);
    } else {
      for (let index = first; index <= last; index += 1) {
        requestedIndexes.push(index);
      }
    }

    const pageNumbers = new Set<number>(requestedIndexes.map((idx) => Math.floor(idx / PAGE_SIZE)));
    pageNumbers.forEach((page) => {
      if (loadedPages.has(page) || loadingPage.has(page)) {
        return;
      }
      setLoadingPage((prev) => new Set(prev).add(page));
      const offset = page * PAGE_SIZE;
      void getData(datasetId, offset, PAGE_SIZE, mode)
        .then((payload) => {
          setColumns(payload.columns);
          setRowCache((prev) => {
            const next = new Map(prev);
            payload.rows.forEach((row, index) => {
              next.set(offset + index, row);
            });
            return next;
          });
          setLoadedPages((prev) => new Set(prev).add(page));
        })
        .finally(() => {
          setLoadingPage((prev) => {
            const next = new Set(prev);
            next.delete(page);
            return next;
          });
        });
    });
  }, [
    datasetId,
    mode,
    hasCaseFilter,
    loadedPages,
    loadingPage,
    parsedCase,
    rowVirtualizer,
    totalRows,
  ]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="homm-panel homm-cornered flex flex-wrap gap-3 rounded-md p-3 shadow-sm">
        <input
          className="homm-input w-72 rounded px-3 py-2 text-sm"
          placeholder="Search variable..."
          value={variableSearch}
          onChange={(event) => setVariableSearch(event.target.value)}
        />
        <input
          className="homm-input w-48 rounded px-3 py-2 text-sm"
          placeholder="Case number"
          value={caseFilter}
          onChange={(event) => setCaseFilter(event.target.value)}
        />
      </div>

      <div className="homm-panel min-h-0 flex-1 overflow-auto rounded-md shadow-sm" ref={containerRef}>
        <table className="homm-table min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-20 border px-2 py-2 text-left">Case</th>
              {filteredColumns.map((column) => (
                <th key={column} className="min-w-52 border px-2 py-2 text-left">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className="align-top"
          >
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr>
                <td
                  colSpan={filteredColumns.length + 1}
                  style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }}
                />
              </tr>
            )}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const absoluteIndex =
                hasCaseFilter && parsedCase > 0 && parsedCase <= totalRows
                  ? parsedCase - 1
                  : virtualRow.index;
              const row = rowCache.get(absoluteIndex);
              return (
                <tr
                  key={virtualRow.key}
                  style={{
                    height: `${virtualRow.size}px`,
                  }}
                >
                  <td className="w-20 border px-2 py-2">
                    {absoluteIndex + 1}
                  </td>
                  {filteredColumns.map((column) => (
                    <td key={column} className="min-w-52 border px-2 py-2">
                      {row ? displayValue(row[column]) : ""}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr>
                <td
                  colSpan={filteredColumns.length + 1}
                  style={{
                    height: `${
                      rowVirtualizer.getTotalSize() -
                      rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end
                    }px`,
                  }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
