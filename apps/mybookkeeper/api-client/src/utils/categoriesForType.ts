import { CATEGORIES_FOR_TYPE } from "../constants/transactionTypes";
import type { TransactionType } from "../types/transaction/TransactionType";

/**
 * The categories a type can carry. A form that hasn't read its type in yet
 * (no value) gets the expense list, as it always has.
 */
export function categoriesForType(type: TransactionType | undefined): readonly string[] {
  return type ? CATEGORIES_FOR_TYPE[type] : CATEGORIES_FOR_TYPE.expense;
}
