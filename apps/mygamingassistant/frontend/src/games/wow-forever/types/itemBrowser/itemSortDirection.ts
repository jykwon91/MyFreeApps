/** Which way a sort runs (the URL's `dir` values). */
export const SORT_DIRECTION = { asc: "asc", desc: "desc" } as const;
export type SortDirection = (typeof SORT_DIRECTION)[keyof typeof SORT_DIRECTION];
