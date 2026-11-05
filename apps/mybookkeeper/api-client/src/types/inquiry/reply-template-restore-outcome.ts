/** How a restore ended, once any lost answer has been settled by reloading the archived list. */
export type ReplyTemplateRestoreOutcome = "restored" | "gone" | "viewOnly" | "stillArchived" | "unsure" | "failed";
