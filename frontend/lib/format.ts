const MINUS = "−"; // typographic minus, aligns with digits

/**
 * Money as the shop reads it: whole Rwandan francs with thousands separators, e.g.
 * "RWF 530,000". Missing or unparseable values show "—". Negatives read "−RWF 500";
 * `sign: true` also marks positives ("+RWF 500"), for deltas.
 */
export function formatRwf(
  value: string | number | null | undefined,
  opts: { sign?: boolean } = {}
): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "—";
  const whole = Math.round(number);
  const body = `RWF ${Math.abs(whole).toLocaleString("en-US")}`;
  if (whole < 0) return `${MINUS}${body}`;
  if (whole > 0 && opts.sign) return `+${body}`;
  return body;
}
