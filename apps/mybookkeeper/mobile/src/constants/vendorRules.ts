export const VENDOR_RULE_SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];

/** Category, property, source, times used, status, added: the facts every rule has. */
export const VENDOR_RULE_DETAIL_SKELETON_FACTS = ["a", "b", "c", "d", "e", "f"];

export const VENDOR_RULE_MESSAGES = {
  loadingList: "Loading your vendor rules",
  loadingOne: "Loading this rule",
  couldntLoadList: "I couldn't load your vendor rules.",
  couldntLoadOne: "I couldn't load that rule.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  cantFind: "I can't find that rule.",
  maybeDeleted: "It may have been deleted.",
  back: "Back",
  noneHeading: "No vendor rules yet.",
  noneBody: "When you correct a transaction's category, I'll remember the vendor and apply it automatically next time.",
  clearFilters: "Show all rules",
  tryAnotherFilter: "Try another type, or see them all.",
  noMatches: "No rules of that type.",
  viewOnly: "You can see these rules, but only an owner or admin can delete them.",
  category: "Sets category to",
  property: "Property",
  noProperty: "Any property",
  propertyPending: "Loading…",
  propertyMissing: "A property I can't find",
  propertyLoadFailed: "I couldn't load the property name.",
  loadingProperty: "Loading the property name",
  context: "Only when",
  source: "How it was made",
  timesApplied: "Used",
  active: "Status",
  activeYes: "On",
  activeNo: "Off",
  added: "Added",
  delete: "Delete rule",
  deleting: "Deleting…",
  deleted: "Rule deleted.",
  alreadyDeleted: "That rule was already deleted.",
} as const;

export const VENDOR_RULE_FILTER_MESSAGES = {
  button: "Rule type",
  title: "Filter rules",
  allTypes: "All types",
  done: "Show rules",
  clear: "Show all rules",
} as const;

export const DELETE_VENDOR_RULE_BODY =
  "Future transactions matching it won't be categorized automatically. Transactions already categorized stay as they are. This can't be undone.";

export function rulesTotalText(total: number): string {
  return `${total} ${total === 1 ? "rule" : "rules"} total`;
}

export function deleteVendorRuleTitle(pattern: string): string {
  return `Delete the rule for ${pattern}?`;
}
