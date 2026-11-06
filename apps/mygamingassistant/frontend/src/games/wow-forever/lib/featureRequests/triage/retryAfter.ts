/** Seconds from a `Retry-After` header (delta-seconds or an HTTP date), or null when absent / unreadable. */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | null {
  if (header === null || header.trim() === "") return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}
