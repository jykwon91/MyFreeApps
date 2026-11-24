import { INCOME_CATEGORIES, EXPENSE_CATEGORY_LIST, TRANSFER_CATEGORY } from "@mybookkeeper/api-client/constants/transactionCategories";
import { categoriesForType } from "@mybookkeeper/api-client/utils/categoriesForType";
import { useListTransactionCategoriesQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { useMemo } from "react";
import { NO_FILTERS } from "../../constants/transactionFilters";
import type { TransactionFilters } from "../../types/TransactionFilters";
import { toListParams } from "./transactionFilters";

function knownCategories(draft: TransactionFilters): readonly string[] {
  if (draft.type) return categoriesForType(draft.type);
  return [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORY_LIST, TRANSFER_CATEGORY])];
}

/**
 * The categories the rows matching every other choice actually have, as the website's Category filter
 * lists them. Until they load, or if they can't, every category of the chosen type. The chosen one is
 * always offered, so it can be seen and changed.
 */
export function useFilterCategories(draft: TransactionFilters, today: Date): readonly string[] {
  const params = useMemo(
    () => toListParams({ ...draft, category: null, sortBy: NO_FILTERS.sortBy, sortDir: NO_FILTERS.sortDir }, today),
    [draft, today],
  );
  const { data, isError } = useListTransactionCategoriesQuery(params);
  const categories = isError || data === undefined ? knownCategories(draft) : data;
  if (draft.category && !categories.includes(draft.category)) return [draft.category, ...categories];
  return categories;
}
