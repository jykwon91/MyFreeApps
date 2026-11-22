/**
 * Orders GET /utility-plans can be asked for; mirrors the backend's UtilityPlanListSort.
 * "recent" (the default) is newest term first; "renewal" is what needs renewing first, then past plans.
 */
export type UtilityPlanListSort = "recent" | "renewal";
