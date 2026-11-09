/**
 * Display helpers shared by every "how does this compare to the market?"
 * surface — utility rates today, insurance premiums as of this module.
 *
 * The gap is the same quantity in both domains: a signed percentage against a
 * recorded observation. Keeping one implementation means the two cards can
 * never disagree about how ``-0.04`` should read.
 */

/**
 * Signed gap → ``"+38% above market"`` / ``"12% below market"``.
 *
 * The sign is spelled out in words because a bare ``-12%`` reads as bad news
 * when it is the opposite — the plan is beating the market.
 */
export function formatBenchmarkGap(value: string | null): string {
  if (value === null || value.trim() === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  // Round first, then decide the wording. Testing the raw value would render
  // -0.04 as "0% below market" — a direction claimed on a difference the
  // display has already rounded away.
  const rounded = Math.round(parsed * 10) / 10;
  if (rounded === 0) return "level with market";
  const magnitude = Math.abs(rounded).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return rounded > 0 ? `${magnitude}% above market` : `${magnitude}% below market`;
}
