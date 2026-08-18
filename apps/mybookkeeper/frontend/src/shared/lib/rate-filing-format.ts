import { format, parseISO } from "date-fns";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

/**
 * Display helpers for TDI rate filings.
 *
 * Two things these exist to prevent. A filing must never read as more settled
 * than it is — a withdrawn filing and an approved one look identical as a
 * percentage, and only one of them will ever appear on a bill. And no term of
 * art may appear without its meaning nearby: the operator asked, of the
 * shipped screen, "what does approved mean? what does no change mean? what
 * does proposed mean?" — three labels that were doing regulatory work with no
 * legend anywhere on the page.
 */

/** `11.1` → `"+11.1%"`, `0` → `"no change"`, `null` → `"—"`. */
export function formatChangePct(pct: number | null): string {
  if (pct === null) return "—";
  if (pct === 0) return "no change";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

/** `"2026-09-01"` → `"Sep 1, 2026"`. */
export function formatFilingDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

/**
 * Where a filing stands with the regulator.
 *
 * Named for the consequence rather than the process. "Approved" and "Proposed"
 * are the regulator's words and describe what happened at TDI; "In effect" and
 * "Pending decision" describe what it means for the operator's bill, which is
 * the only reason the status is on screen.
 */
export function formatFilingStatus(filing: InsuranceRateFiling): string {
  if (filing.is_in_force) return "In effect";
  if (filing.is_pending) return "Pending decision";
  return "Withdrawn";
}

/**
 * What that status means for the bill, in a full sentence.
 *
 * Shown on policy cards, where there are at most a handful of filings and the
 * operator is deciding what to do. The market list omits it — twenty-five rows
 * each carrying a clause would bury the carrier names, which are the only
 * thing that list is for.
 */
export function formatFilingConsequence(filing: InsuranceRateFiling): string {
  if (filing.is_in_force) return "In effect — this is the rate you'll be charged.";
  if (filing.is_pending) {
    return "Still awaiting a decision from the state — could be cut or refused.";
  }
  return "Withdrawn before taking effect — never reached a bill.";
}

/** Green for a decrease, orange for a rise, grey for flat or unstated. */
export function filingChangeColor(pct: number | null): BadgeColor {
  if (pct === null || pct === 0) return "gray";
  return pct > 0 ? "orange" : "green";
}

/** Grey once it is settled, yellow while the state still has a say. */
export function filingStatusColor(filing: InsuranceRateFiling): BadgeColor {
  return filing.is_pending ? "yellow" : "gray";
}

/**
 * How the projected renewal reads in one line.
 *
 * "average" is load-bearing and appears here rather than only in the footer.
 * A filing is a statewide average across the carrier's whole book, and the
 * first cut said so once, in grey, below everything — so `+11.1%` read as a
 * quote for the operator's house all the way down the page.
 *
 * Zero gets its own sentence rather than "+0%": a carrier holding rates flat is
 * the good news on this page, and a signed zero buries it.
 */
export function formatOutlookHeadline(
  pct: number | null,
  carrier: string | null,
  { hasPendingOnly = false }: { hasPendingOnly?: boolean } = {},
): string {
  const who = carrier ?? "This carrier";
  if (pct === null && hasPendingOnly) {
    return `${who} has a rate change pending with the state — not decided yet.`;
  }
  if (pct === null) {
    return `${who}'s recent filings didn't result in a rate change that took effect.`;
  }
  if (pct === 0) return `${who} filed with the state to hold dwelling rates flat.`;
  if (pct < 0) return `${who} filed a rate decrease with the state.`;
  return `${who} filed an average rate increase with the state.`;
}

/**
 * The label on the fold hiding a card's non-binding filings.
 *
 * Says how many and, when it applies, that one is still live — a pending
 * filing is the reason someone would open this, so hiding that fact behind the
 * fold would defeat it.
 */
export function formatFoldSummary(filings: InsuranceRateFiling[]): string {
  const noun = filings.length === 1 ? "filing" : "filings";
  const pending = filings.some((filing) => filing.is_pending);
  const tail = pending ? ", including one still pending a decision" : "";
  return `See ${filings.length} more ${noun} from this carrier${tail}`;
}

/**
 * The dollar movement, e.g. `"+$268/yr"`.
 *
 * The percentage is the insurer's unit; dollars per year is the operator's.
 * Showing the two endpoints and leaving them to subtract is asking them to do
 * arithmetic to reach the only number that changes their budget.
 */
export function formatPremiumDelta(
  currentCents: number | null,
  projectedCents: number | null,
): string | null {
  if (currentCents === null || projectedCents === null) return null;
  const delta = projectedCents - currentCents;
  if (delta === 0) return null;
  const dollars = Math.round(Math.abs(delta) / 100);
  return `${delta > 0 ? "+" : "−"}$${dollars.toLocaleString("en-US")}/yr`;
}
