function cellValue(value, type) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (type === "number" && /^-?\d+(?:\.\d+)?$/.test(text)) return text;
  return /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function escapeCell(value) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function createCsv(rows, columns) {
  const lines = [
    columns.map(({ label }) => escapeCell(String(label))).join(","),
    ...rows.map((row) =>
      columns
        .map(({ key, type }) => escapeCell(cellValue(row[key], type)))
        .join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
