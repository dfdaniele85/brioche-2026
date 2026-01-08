export function downloadCSV(filename: string, rows: Array<Record<string, string | number>>) {
  const headers = Object.keys(rows[0] ?? {});
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const lines = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(String(r[h] ?? ""))).join(";")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
