import { EXPENSE_CATEGORY_LIST, INCOME_CATEGORIES } from "@mybookkeeper/api-client/constants/transactionCategories";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import type { TransactionEditValues } from "../../types/TransactionEditValues";

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export function toEditValues(transaction: Transaction): TransactionEditValues {
  return {
    vendor: transaction.vendor ?? "",
    amount: transaction.amount,
    type: transaction.transaction_type,
    category: transaction.category,
    propertyId: transaction.property_id,
    description: transaction.description ?? "",
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
  if (amount === "" || Number(amount) === 0) return "Enter an amount above $0.";
  if (!MONEY_PATTERN.test(amount)) return "Use dollars and cents, like 84.20.";
  return undefined;
}

/** Only what changed: editing one field must not rewrite the others, or teach a rule by accident. */
export function changedFields(values: TransactionEditValues, original: Transaction): Partial<Transaction> {
  const changes: Partial<Transaction> = {};
  const vendor = values.vendor.trim();
  const description = values.description.trim();
  if (vendor !== (original.vendor ?? "")) changes.vendor = vendor || null;
  if (description !== (original.description ?? "")) changes.description = description || null;
  if (!isSameAmount(values.amount, original.amount)) changes.amount = values.amount.trim();
  if (values.type !== original.transaction_type) changes.transaction_type = values.type;
  if (values.category !== original.category) changes.category = values.category;
  if (values.propertyId !== original.property_id) changes.property_id = values.propertyId;
  return changes;
}

/** Active properties, plus the row's own property if it has since been retired. */
export function selectableProperties(properties: readonly Property[], currentId: string | null): Property[] {
  return properties.filter((property) => property.is_active || property.id === currentId);
}
