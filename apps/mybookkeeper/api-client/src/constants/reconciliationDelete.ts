export const RECONCILIATION_DELETE_MESSAGES = {
  action: "Delete",
  deleting: "Deleting…",
  hint: "Asks you to confirm first",
  confirmTitle: "Delete this 1099?",
  confirmBody: "I'll remove it and anything I matched to it. Your transactions stay as they are.",
  deleted: "Deleted that 1099.",
  failed: "I couldn't delete that 1099. Want to try again?",
} as const;

export function reconciliationDeleteLabel(issuer: string | null): string {
  return issuer ? `Delete the 1099 from ${issuer}` : "Delete this 1099";
}
