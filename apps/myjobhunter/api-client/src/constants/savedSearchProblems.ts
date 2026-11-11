/** Board tokens and company slugs, as the backend validates them (a slug after lowercasing). */
export const BOARD_TOKEN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
export const COMPANY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Why a saved search can't be saved yet. */
export const SAVED_SEARCH_PROBLEMS = {
  noBoardToken: "Enter a Greenhouse board token",
  badBoardToken: "Invalid board token — use letters, digits, hyphens, and underscores only",
  noCompanySlug: "Enter a Lever company slug",
  badCompanySlug: "Invalid company slug — use lowercase letters, digits, and hyphens only",
  noRoles: "Add at least one role title",
  namePrefix: "Name: ",
} as const;

/** Said under a token or slug while it is typed, before anything is saved. */
export const SAVED_SEARCH_FIELD_HINTS = {
  badBoardToken: "Invalid token — use letters, digits, hyphens, and underscores only.",
  boardToken: "Find this in the Greenhouse board URL: boards.greenhouse.io/​<board_token>",
  badCompanySlug: "Invalid slug — use lowercase letters, digits, and hyphens only.",
  companySlug: "Find this in the Lever URL: jobs.lever.co/​<company_slug>",
} as const;
