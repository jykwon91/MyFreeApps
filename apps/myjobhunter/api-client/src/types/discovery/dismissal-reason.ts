/** Why the user dismissed a discovered job, sent with POST /discover/{id}/dismiss. */
export type DismissalReason =
  | "wrong_stack"
  | "too_small_company"
  | "wrong_sector"
  | "wrong_comp"
  | "not_remote"
  | "not_interested"
  | "other";
