export function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function delta(now: number, prev: number): string {
  const diff = now - prev;
  if (diff === 0) return "±0";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff}`;
}

export function chunkForDiscord(text: string, limit = 1900): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + limit, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > cursor + 200) end = nl;
    }
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}
