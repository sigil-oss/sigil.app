/** Shorten a Qubic identity or hash for display. head + tail chars, separated by "…". */
export function truncateId(id: string, head = 8, tail = 8): string {
  const chars = Array.from(id);
  if (!id || chars.length <= head + tail) return id;
  return `${chars.slice(0, head).join("")}…${chars.slice(-tail).join("")}`;
}

/** Extracts a human-readable message from an unknown thrown value. */
export function extractMessage(e: unknown, fallback = "An error occurred."): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}

/** Format a QU amount (bigint, string, or number) with locale-aware thousand separators. */
export function formatQu(amount: bigint | string | number): string {
  try {
    const n = typeof amount === "number" ? BigInt(Math.round(amount)) : BigInt(amount);
    return n.toLocaleString();
  } catch { return "—"; }
}

function formatCompactFraction(value: bigint, divisor: bigint, decimals: number): string {
  const whole = value / divisor;
  if (decimals === 0) return whole.toString();

  const scale = 10n ** BigInt(decimals);
  const fraction = ((value % divisor) * scale) / divisor;
  const trimmed = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

/** Compact QU format for list rows — 1K / 1.2M / 3.4B. Full precision below 1 000. */
export function formatQuCompact(amount: bigint | string | number): string {
  try {
    const raw = typeof amount === "number" ? BigInt(Math.round(amount)) : BigInt(amount);
    const sign = raw < 0n ? "-" : "";
    const n = raw < 0n ? -raw : raw;
    if (n >= 1_000_000_000n) return `${sign}${formatCompactFraction(n, 1_000_000_000n, 2)}B`;
    if (n >= 1_000_000n) return `${sign}${formatCompactFraction(n, 1_000_000n, 2)}M`;
    if (n >= 1_000n) return `${sign}${formatCompactFraction(n, 1_000n, 1)}K`;
    return `${sign}${n.toLocaleString()}`;
  } catch { return "—"; }
}

export function formatUsdFromQu(amount: bigint | string | number, price: number): string {
  try {
    if (!Number.isFinite(price) || price < 0) return "—";
    const n = typeof amount === "number" ? BigInt(Math.round(amount)) : BigInt(amount);
    const priceCents = BigInt(Math.round(price * 100));
    const totalCents = n * priceCents;
    const dollars = totalCents / 100n;
    const cents = (totalCents % 100n).toString().padStart(2, "0");
    return `${dollars.toLocaleString()}.${cents}`;
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
