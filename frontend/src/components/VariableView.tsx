import { type VariableMetadata } from "../api";

interface VariableViewProps {
  variables: VariableMetadata[];
}

function renderValue(value: string): string {
  return value || "";
}

export function VariableView({ variables }: VariableViewProps) {
  return (
    <div className="homm-panel h-full overflow-auto rounded-md shadow-sm">
      <table className="homm-table min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="min-w-40 border px-2 py-2 text-left">Имя</th>
            <th className="min-w-28 border px-2 py-2 text-left">Тип</th>
            <th className="min-w-56 border px-2 py-2 text-left">Метка</th>
            <th className="min-w-72 border px-2 py-2 text-left">Значения</th>
            <th className="min-w-56 border px-2 py-2 text-left">Пропущенные</th>
            <th className="min-w-28 border px-2 py-2 text-left">Шкала</th>
          </tr>
        </thead>
        <tbody>
          {variables.map((variable) => (
            <tr key={variable.name}>
              <td className="border px-2 py-2">{renderValue(variable.name)}</td>
              <td className="border px-2 py-2">{renderValue(variable.type)}</td>
              <td className="border px-2 py-2">{renderValue(variable.label)}</td>
              <td className="whitespace-pre-wrap border px-2 py-2">
                {renderValue(variable.values)}
              </td>
              <td className="border px-2 py-2">{renderValue(variable.missing)}</td>
              <td className="border px-2 py-2">{renderValue(variable.scale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
