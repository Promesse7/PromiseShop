interface TableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function Table<T extends object>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data",
}: TableProps<T>) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-divider">
          {columns.map((col) => (
            <th key={col.key} className="text-left font-medium py-2 px-2 text-text/70">
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-6 text-center text-text/50">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-divider">
              {columns.map((col) => (
                <td key={col.key} className="py-2 px-2">
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
