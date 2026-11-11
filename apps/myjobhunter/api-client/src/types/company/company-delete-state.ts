/**
 * Whether a company can be deleted, from its applications list: `waiting` until the list
 * loads (until then "no applications" isn't known), `blocked` while it has any.
 */
export type CompanyDeleteState = "waiting" | "blocked" | "allowed";
