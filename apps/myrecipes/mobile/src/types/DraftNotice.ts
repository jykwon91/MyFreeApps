/** What the new-recipe form says over a draft it was filled in from. */
export interface DraftNotice {
  message: string;
  tone: "error" | "success";
}
