export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(
  rows: readonly object[],
  columns: Array<{ key: string; label: string; width?: number }>,
): void {
  if (rows.length === 0) {
    console.log("(no rows)");
    return;
  }
  const header = columns.map((c) => pad(c.label, c.width ?? 20)).join("  ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    console.log(columns.map((c) => pad(String(r[c.key] ?? ""), c.width ?? 20)).join("  "));
  }
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}
