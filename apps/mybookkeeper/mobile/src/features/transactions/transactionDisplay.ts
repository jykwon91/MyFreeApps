import { TRANSACTION_SORT_FIELDS } from "@mybookkeeper/api-client/constants/transactionSort";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { SortDirection } from "@mybookkeeper/api-client/types/sort/SortDirection";
import type { TaxRelevantChoice } from "@mybookkeeper/api-client/types/transaction/TaxRelevantChoice";
import type { TransactionSortField } from "@mybookkeeper/api-client/types/transaction/TransactionSortField";
import { taxRelevantParam } from "@mybookkeeper/api-client/utils/taxRelevantParam";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";
import { formatCurrency } from "@platform/core/utils/currency";
import { SORT_DIRECTIONS } from "../../constants/sortSheet";
import { TAX_FILTER } from "../../constants/transactionFilters";
import { fullDateLabel } from "../../lib/localDate";
import { formatTag } from "@platform/core/utils/tag";

const STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: "Pending",
  needs_review: "Needs review",
  unverified: "Unverified",
  duplicate: "Possible duplicate",
  approved: "Approved",
};

export function statusLabel(status: TransactionStatus): string {
  return STATUS_LABELS[status];
}

export function isReviewable(status: TransactionStatus): boolean {
  return status === "pending" || status === "needs_review" || status === "unverified";
}

export function transactionName(transaction: Transaction): string {
  return transaction.vendor || transaction.description || "Untitled transaction";
}

/** Properties may not have loaded, and a row with a property must never read as having none. */
export function propertyLabel(propertyId: string | null, properties: readonly Property[]): string {
  if (propertyId === null) return "No property";
  return properties.find((property) => property.id === propertyId)?.name ?? "A property";
}

/** "Mar 1, 2026 to Mar 31, 2026" */
export function customRangeLabel(startDate: string, endDate: string): string {
  return `${fullDateLabel(startDate)} to ${fullDateLabel(endDate)}`;
}

export function categoryLabel(category: string): string {
  return formatTag(category);
}

// A date with no time: new Date("2025-03-14") is midnight UTC, the day before in the US.
function localDate(isoDate: string): Date {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shortDate(isoDate: string, now: Date = new Date()): string {
  const date = localDate(isoDate);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function spokenDate(isoDate: string): string {
  return localDate(isoDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Money in is positive. An expense with a negative amount is a refund, so it's money in. */
function signedAmount(transaction: Transaction): number {
  const amount = Number(transaction.amount);
  return transaction.transaction_type === "income" ? amount : -amount;
}

export function isMoneyIn(transaction: Transaction): boolean {
  return signedAmount(transaction) > 0;
}

/** Goes by whole cents: a total can carry a rounding residue that would read as "−$0.00". */
export function moneySign(value: number): number {
  return Math.sign(Math.round(value * 100));
}

export function signedMoney(value: number): string {
  const sign = moneySign(value) > 0 ? "+" : moneySign(value) < 0 ? "\u2212" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

export function displayAmount(transaction: Transaction): string {
  return signedMoney(signedAmount(transaction));
}

export function spokenMoney(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  const dollarWords = `${dollars.toLocaleString("en-US")} ${dollars === 1 ? "dollar" : "dollars"}`;
  return rest === 0 ? dollarWords : `${dollarWords} and ${rest} ${rest === 1 ? "cent" : "cents"}`;
}

export function spokenSignedMoney(value: number): string {
  return `${moneySign(value) < 0 ? "minus " : ""}${spokenMoney(value)}`;
}

/** Only negative income is money going out of income: a negative expense is said as a refund. */
export function spokenAmount(transaction: Transaction): string {
  const amount = Number(transaction.amount);
  const money = spokenMoney(amount);
  return transaction.transaction_type === "income" && amount < 0 ? `minus ${money}` : money;
}

/** Screen readers skip or misread a minus sign, so the words carry the direction. */
export function spokenKind(transaction: Transaction): string {
  const isRefund = transaction.transaction_type === "expense" && Number(transaction.amount) < 0;
  return `${categoryLabel(transaction.category)} ${isRefund ? "refund" : transaction.transaction_type}`;
}

export function rowAccessibilityLabel(transaction: Transaction, propertyName: string | null): string {
  return [
    spokenKind(transaction),
    transactionName(transaction),
    spokenAmount(transaction),
    spokenDate(transaction.transaction_date),
    propertyName,
    transaction.status === "approved" ? null : statusLabel(transaction.status).toLowerCase(),
  ]
    .filter(Boolean)
    .join(", ");
}

export function taxFilterLabel(choice: TaxRelevantChoice): string {
  return taxRelevantParam(choice) ? TAX_FILTER.included : TAX_FILTER.leftOut;
}

/** "Amount, ascending": how a list ordered other than newest first says so. */
export function sortLabel(field: TransactionSortField, direction: SortDirection): string {
  const fieldName = TRANSACTION_SORT_FIELDS.find((option) => option.value === field)?.label ?? field;
  const directionName = SORT_DIRECTIONS.find((option) => option.value === direction)?.label ?? direction;
  return `${fieldName}, ${directionName.toLowerCase()}`;
}
