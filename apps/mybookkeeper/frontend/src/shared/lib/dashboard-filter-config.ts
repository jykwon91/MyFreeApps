import { REVENUE_TAGS, EXPENSE_TAGS } from "./constants";
import { ALL_SUMMARY_CATEGORIES } from "@mybookkeeper/api-client/utils/categoryFilter";

export { categoriesForPreset as getCategoriesForPreset } from "@mybookkeeper/api-client/utils/categoryFilter";

/** All categories available for dashboard filtering */
export const ALL_DASHBOARD_CATEGORIES = new Set<string>(ALL_SUMMARY_CATEGORIES);

/** Category groups for the filter bar UI */
export const INCOME_CATEGORY_LIST: readonly string[] = [...REVENUE_TAGS];
export const EXPENSE_CATEGORY_LIST_FILTER: readonly string[] = [...EXPENSE_TAGS];
