import { MAX_TAX_RETURN_YEAR, MIN_TAX_RETURN_YEAR } from "@mybookkeeper/api-client/constants/taxReturnYears";
import { EXPENSE_CATEGORY_LIST, INCOME_CATEGORIES } from "@mybookkeeper/api-client/constants/transactionCategories";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { isAllowedTaxYear } from "@mybookkeeper/api-client/utils/transactionTaxYear";
import type { TransactionEditValues } from "../../types/TransactionEditValues";

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const YEAR_PATTERN = /^\d{4}$/;

export function toEditValues(transaction: Transaction): TransactionEditValues {
  return {
    date: transaction.transaction_date,
    taxYear: String(transaction.tax_year),
    vendor: transaction.vendor ?? "",
    vendorId: transaction.vendor_id,
    amount: transaction.amount,
    type: transaction.transaction_type,
    category: transaction.category,
    propertyId: transaction.property_id,
    description: transaction.description ?? "",
    channel: transaction.channel ?? "",
    paymentMethod: transaction.payment_method ?? "",
    taxRelevant: transaction.tax_relevant,
  };
}

/** The list for this type, plus the row's own value if it's one the list doesn't offer. */
export function categoryChoices(type: TransactionType, current: string): string[] {
  const list: readonly string[] = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORY_LIST;
  return list.includes(current) ? [...list] : [current, ...list];
}

export function categoryFitsType(type: TransactionType, category: string): boolean {
  const list: readonly string[] = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORY_LIST;
  return list.includes(category);
}

function isSameAmount(first: string, second: string): boolean {
  return Number(first) === Number(second);
}

export function amountError(values: TransactionEditValues, original: Transaction): string | undefined {
  const amount = values.amount.trim();
  if (isSameAmount(amount, original.amount) && amount !== "") return undefined;
  return moneyInputError(amount);
}

/** Only a changed year is checked, so a row already filed under an older year still saves. */
export function taxYearError(values: TransactionEditValues, original: Transaction): string | undefined {
  const year = values.taxYear.trim();
  if (year === String(original.tax_year)) return undefined;
  if (YEAR_PATTERN.test(year) && isAllowedTaxYear(Number(year))) return undefined;
  return `Use a year from ${MIN_TAX_RETURN_YEAR} to ${MAX_TAX_RETURN_YEAR}.`;
}

export function moneyInputError(amount: string): string | undefined {
  if (amount === "" || Number(amount) === 0) return "Enter an amount above $0.";
  if (!MONEY_PATTERN.test(amount)) return "Use dollars and cents, like 84.20.";
  return undefined;
}

/** Only what changed: editing one field must not rewrite the others, or teach a rule by accident. */
export function changedFields(values: TransactionEditValues, original: Transaction): Partial<Transaction> {
  const changes: Partial<Transaction> = {};
  const vendor = values.vendor.trim();
  const description = values.description.trim();
  const taxYear = Number(values.taxYear.trim());
  if (values.date !== original.transaction_date) changes.transaction_date = values.date;
  if (taxYear !== original.tax_year) changes.tax_year = taxYear;
  if (values.vendorId !== original.vendor_id) changes.vendor_id = values.vendorId;
  if (vendor !== (original.vendor ?? "")) changes.vendor = vendor || null;
  if (description !== (original.description ?? "")) changes.description = description || null;
  if (!isSameAmount(values.amount, original.amount)) changes.amount = values.amount.trim();
  if (values.type !== original.transaction_type) changes.transaction_type = values.type;
  if (values.category !== original.category) changes.category = values.category;
  if (values.propertyId !== original.property_id) changes.property_id = values.propertyId;
  // Empty goes as null, the way the website sends a cleared choice.
  if (values.channel !== (original.channel ?? "")) changes.channel = values.channel || null;
  if (values.paymentMethod !== (original.payment_method ?? "")) changes.payment_method = values.paymentMethod || null;
  if (values.taxRelevant !== original.tax_relevant) changes.tax_relevant = values.taxRelevant;
  return changes;
}

/** Active properties, plus the row's own property if it has since been retired. */
export function selectableProperties(properties: readonly Property[], currentId: string | null): Property[] {
  return properties.filter((property) => property.is_active || property.id === currentId);
}
