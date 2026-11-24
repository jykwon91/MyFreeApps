import type { SpendingCategoryListResponse } from "@mybookkeeper/api-client/types/spending-category/SpendingCategoryListResponse";

/** GET /spending-categories for someone with no custom categories yet. */
export const NO_SPENDING_CATEGORIES: SpendingCategoryListResponse = { items: [] };

/** What useListSpendingCategoriesQuery returns, once loaded, for a test that mocks the module. */
export const EMPTY_SPENDING_CATEGORIES_QUERY = { data: NO_SPENDING_CATEGORIES, isLoading: false, isError: false } as const;
