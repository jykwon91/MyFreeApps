/**
 * Splitting a transaction across properties, to the cent. Mirrors the backend's
 * property_split_math: an even split gives each property the same number of
 * cents and the cents left over go one each to the first properties, so the
 * shares always add up to the total. The server checks every split again.
 */
import { PROPERTY_SPLIT_LABELS } from "../constants/propertySplitLabels";
import { MIN_SPLIT_PROPERTIES, NOT_SPLITTABLE_STATUSES } from "../constants/propertySplitLimits";
import { formatCurrency } from "@platform/core/utils/currency";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { PropertySplitDraftCheck } from "../types/transaction/PropertySplitDraftCheck";
import type { PropertySplitDraftRow } from "../types/transaction/PropertySplitDraftRow";
import type { TransactionPropertyShare } from "../types/transaction/TransactionPropertyShare";
import type { Transaction } from "../types/transaction/transaction";
import type { TransactionPropertySplit } from "../types/transaction/TransactionPropertySplit";
import { moneyTextToCents } from "./moneyTextToCents";

export function evenShareCents(totalCents: number, count: number): number[] {
  if (count < 1) return [];
  const base = Math.floor(totalCents / count);
  const leftover = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < leftover ? 1 : 0));
}

export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function isSplit(transaction: { property_splits: readonly TransactionPropertySplit[] }): boolean {
  return transaction.property_splits.length > 0;
}

/** A line per property, ticked and filled in from the split the transaction already has. */
export function draftFromSplits(
  propertyIds: readonly string[],
  splits: readonly TransactionPropertySplit[],
): PropertySplitDraftRow[] {
  const amounts = new Map(splits.flatMap((split) => (split.property_id ? [[split.property_id, split.amount] as const] : [])));
  return propertyIds.map((property_id) => ({
    property_id,
    included: amounts.has(property_id),
    amount: amounts.get(property_id) ?? "",
  }));
}

/** The ticked properties share the total evenly, the odd cents to the first; unticked lines are cleared. */
export function evenDraft(rows: readonly PropertySplitDraftRow[], totalCents: number): PropertySplitDraftRow[] {
  const shares = evenShareCents(totalCents, rows.filter((row) => row.included).length);
  let next = 0;
  return rows.map((row) => (row.included ? { ...row, amount: centsToAmount(shares[next++]) } : { ...row, amount: "" }));
}

export function checkDraft(
  rows: readonly PropertySplitDraftRow[],
  totalCents: number,
  decimalSeparator: DecimalSeparator,
): PropertySplitDraftCheck {
  const included = rows.filter((row) => row.included);
  const cents = included.map((row) => moneyTextToCents(row.amount, decimalSeparator));
  const assignedCents = cents.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
  const hasBadShare = cents.some((value) => typeof value !== "number" || value <= 0);
  const remainingCents = totalCents - assignedCents;
  return {
    includedCount: included.length,
    assignedCents,
    remainingCents,
    hasBadShare,
    canSave: included.length >= MIN_SPLIT_PROPERTIES && !hasBadShare && remainingCents === 0,
  };
}

/** The ticked lines as the shares the server takes. Only call once checkDraft says it can save. */
export function draftShares(rows: readonly PropertySplitDraftRow[], decimalSeparator: DecimalSeparator): TransactionPropertyShare[] {
  return rows
    .filter((row) => row.included)
    .map((row) => ({ property_id: row.property_id, amount: centsToAmount(moneyTextToCents(row.amount, decimalSeparator) ?? 0) }));
}

/** "6732 Peerless $33.34, 6734 Peerless $33.33": each share, largest first as the server sends them. */
export function splitDetail(splits: readonly TransactionPropertySplit[], propertyNames: ReadonlyMap<string, string>): string {
  return splits
    .map((split) => {
      const name = split.property_id ? propertyNames.get(split.property_id) : undefined;
      return `${name ?? PROPERTY_SPLIT_LABELS.unassignedShare} ${formatCurrency(split.amount)}`;
    })
    .join(", ");
}

/** What the editor says under the shares: what's missing, or that they add up. */
export function draftStatus(check: PropertySplitDraftCheck, amount: string): string {
  if (check.includedCount < MIN_SPLIT_PROPERTIES) return PROPERTY_SPLIT_LABELS.pickProperties;
  const remaining = formatCurrency(centsToAmount(Math.abs(check.remainingCents)));
  if (check.remainingCents > 0) return PROPERTY_SPLIT_LABELS.leftToAssign(remaining);
  if (check.remainingCents < 0) return PROPERTY_SPLIT_LABELS.overAssigned(remaining);
  return PROPERTY_SPLIT_LABELS.assigned(formatCurrency(centsToAmount(check.assignedCents)), formatCurrency(amount));
}

/** Whether a transaction may be split across properties: rental or business money, with two properties to share it. */
export function canSplit(
  transaction: Pick<Transaction, "transaction_type" | "transaction_scope" | "status">,
  propertyCount: number,
): boolean {
  return (
    transaction.transaction_type !== "transfer"
    && transaction.transaction_scope !== "personal"
    && !NOT_SPLITTABLE_STATUSES.includes(transaction.status)
    && propertyCount >= MIN_SPLIT_PROPERTIES
  );
}
