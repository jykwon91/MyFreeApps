import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";

/**
 * What happened to every policy, in one line, before any card is read.
 *
 * The section handles each policy in one of three ways and only one of them
 * produces a visible result, so an operator with three policies and one filed
 * increase saw one answer and concluded the other two had been skipped. Their
 * words: "why do i only see options for 1 property instead of all?"
 *
 * Nothing here is new data — it is a count of what the cards below already
 * say. Stating the total up front is what stops the reader inferring it from
 * how many cards look interesting.
 */
export function formatScopeSummary(
  outlooks: InsurancePolicyRateOutlook[],
): string {
  const total = outlooks.length;
  const increased = outlooks.filter(
    (outlook) =>
      outlook.projected_change_pct !== null && outlook.projected_change_pct > 0,
  ).length;
  // Not "failed to check" — a homeowners policy and a surplus-lines carrier
  // are both permanently outside this dataset, which is an answer rather than
  // a gap.
  const uncovered = outlooks.filter((outlook) => !outlook.is_checkable).length;
  const quiet = total - increased - uncovered;

  const parts: string[] = [];
  if (increased > 0) parts.push(`${increased} filed an increase`);
  if (quiet > 0) parts.push(`${quiet} with nothing filed`);
  if (uncovered > 0) parts.push(`${uncovered} this feed doesn't cover`);

  const noun = total === 1 ? "policy" : "policies";
  if (parts.length === 0) return `Checked your ${total} ${noun}.`;
  return `Checked your ${total} ${noun} — ${parts.join(", ")}.`;
}
