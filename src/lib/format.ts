/** Shorten a Qubic identity or hash for display. head + tail chars, separated by "…". */
export function truncateId(id: string, head = 8, tail = 8): string {
  if (!id || id.length <= head + tail) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

function sanitizeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Extracts a human-readable message from an unknown thrown value. */
export function extractMessage(e: unknown, fallback = "An error occurred."): string {
  if (e instanceof Error) return sanitizeText(e.message);
  if (typeof e === "string") return sanitizeText(e);
  return sanitizeText(fallback);
}

/** Format a QU amount (bigint, string, or number) with locale-aware thousand separators. */
export function formatQu(amount: bigint | string | number): string {
  try {
    const n = typeof amount === "number" ? BigInt(Math.round(amount)) : BigInt(amount);
    return n.toLocaleString();
  } catch { return "—"; }
}

/** Compact QU format for list rows — 1K / 1.2M / 3.4B. Full precision below 1 000. */
export function formatQuCompact(amount: bigint | string | number): string {
  try {
    const n = Number(BigInt(typeof amount === "number" ? Math.round(amount) : amount));
    if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
    if (n >= 1_000_000)     return `${+(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
    if (n >= 1_000)         return `${+(n / 1_000).toFixed(1).replace(/\.?0+$/, "")}K`;
    return n.toLocaleString();
  } catch { return "—"; }
}

/** Format a Unix-ms timestamp as locale date+time, e.g. "May 21, 14:32". */
export function formatDate(timestampMs: number | null | undefined): string {
  if (!timestampMs) return "";
  try {
    return new Date(timestampMs).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch { return ""; }
}
