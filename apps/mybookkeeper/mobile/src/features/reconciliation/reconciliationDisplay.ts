import type { AutoReconcileResult } from "@mybookkeeper/api-client/types/reconciliation/auto-reconcile-result";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import type { ReconciliationSourceStatus } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source-status";
import { formatCurrency } from "@platform/core/utils/currency";
import { MAX_REPORTED_AMOUNT, RECONCILIATION_MESSAGES as MESSAGES, SOURCE_TYPES, TAX_YEARS_OFFERED } from "../../constants/reconciliation";
import type { ReconciliationFilter } from "../../types/ReconciliationFilter";
import { spokenMoney } from "../transactions/transactionDisplay";
import { moneyInputError } from "../transactions/transactionEditValues";

const STATUS_WORDS: Record<ReconciliationSourceStatus, string> = {
  unmatched: MESSAGES.notMatched,
  partial: MESSAGES.partlyMatched,
  matched: MESSAGES.matched,
  confirmed: MESSAGES.confirmed,
};

export function taxYearChoices(today: Date): number[] {
  return Array.from({ length: TAX_YEARS_OFFERED }, (_, index) => today.getFullYear() - 1 - index);
}

/** A deep link can carry anything, so only a year the screen offers is used. */
export function formYear(param: string | undefined, today: Date): number {
  const choices = taxYearChoices(today);
  const year = Number(param);
  return choices.includes(year) ? year : choices[0];
}

export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPES.find((type) => type.value === sourceType)?.label ?? MESSAGES.taxForm;
}

export function sourceTitle(source: ReconciliationSource): string {
  const label = sourceTypeLabel(source.source_type);
  if (source.issuer) return `${label} · ${source.issuer}`;
  return source.document_file_name ?? label;
}

export function statusWord(status: ReconciliationSourceStatus): string {
  return STATUS_WORDS[status];
}

export function needsLook(source: ReconciliationSource): boolean {
  return source.status === "unmatched" || source.status === "partial";
}

export function sourcesFor(sources: readonly ReconciliationSource[], filter: ReconciliationFilter): readonly ReconciliationSource[] {
  return filter === "all" ? sources : sources.filter(needsLook);
}

/** Before a comparison the record total is just $0, so the whole form would read as a gap. */
export function hasBeenCompared(source: ReconciliationSource): boolean {
  return source.status !== "unmatched";
}

export function differenceLine(source: ReconciliationSource): string | null {
  const difference = Number(source.discrepancy);
  if (!hasBeenCompared(source) || difference === 0) return null;
  return `${formatCurrency(Math.abs(difference))} ${difference > 0 ? "more" : "less"} on the form`;
}

export function rowLabel(source: ReconciliationSource): string {
  const parts = [sourceTitle(source).replace(" · ", " "), `${MESSAGES.reported} ${spokenMoney(Number(source.reported_amount))}`];
  if (source.property_name) parts.push(source.property_name);
  if (hasBeenCompared(source)) parts.push(`${MESSAGES.inMyRecords} ${spokenMoney(Number(source.matched_amount))}`);
  const difference = Number(source.discrepancy);
  if (hasBeenCompared(source) && difference !== 0) {
    parts.push(`${spokenMoney(difference)} ${difference > 0 ? "more" : "less"} on the form`);
  }
  parts.push(statusWord(source.status));
  return parts.join(", ");
}

export function noSourcesHeading(year: number): string {
  return `I don't have any 1099s for ${year} yet.`;
}

export function allMatchHeading(year: number): string {
  return `Everything matches for ${year}.`;
}

export function compareResultMessage(result: AutoReconcileResult): string {
  const { auto_matched: matched, discrepancies: differ, sources_checked: checked } = result;
  if (matched + differ === 0) return MESSAGES.nothingFound;
  const summary = `${matched} matched, ${differ} ${differ === 1 ? "differs" : "differ"}.`;
  const skipped = checked - matched - differ;
  return skipped > 0 ? `${summary} ${skipped} had nothing to compare.` : summary;
}

export function reportedAmountError(amount: string): string | undefined {
  const trimmed = amount.trim();
  return moneyInputError(trimmed) ?? (Number(trimmed) >= MAX_REPORTED_AMOUNT ? MESSAGES.tooLarge : undefined);
}
