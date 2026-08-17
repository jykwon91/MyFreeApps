import { format, parseISO } from "date-fns";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

/**
 * Display helpers for TDI rate filings.
 *
 * The thing these exist to prevent is a filing reading as more settled than it
 * is. A withdrawn filing and an approved one look identical as a percentage,
 * and only one of them will ever appear on a bill.
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
 * Where a filing stands with the regulator, in the operator's words.
 *
 * "Approved" is the only label that means the rate will be charged. A filing
 * that is neither in force nor pending closed as withdrawn or rejected — the
 * carrier asked and did not get it — and saying so is the difference between
 * an accurate picture and a phantom increase.
 */
export function formatFilingStatus(filing: InsuranceRateFiling): string {
  if (filing.is_in_force) return "Approved";
  if (filing.is_pending) return "Proposed";
  return "Not approved";
}

/**
 * How the projected renewal reads in one line.
 *
 * Zero gets its own sentence rather than "+0%": a carrier holding rates flat is
 * the good news on this page, and a signed zero buries it.
 */
export function formatOutlookHeadline(
  pct: number | null,
  carrier: string | null,
): string {
  const who = carrier ?? "This carrier";
  if (pct === null) return `${who} — no approved change found`;
  if (pct === 0) return `${who} is holding rates flat`;
  if (pct < 0) return `${who} filed a decrease`;
  return `${who} filed an increase`;
}
