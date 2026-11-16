/** The property question asked before approving a transaction that has none. */
export const APPROVAL_PROPERTY_MESSAGES = {
  title: "Which property is this for?",
  description: "I need a property before I can approve this.",
  failed: "I couldn't load your properties. Close this and try again.",
  loading: "I'm still loading your properties.",
  none: "You don't have any properties yet. Add one, then come back to approve this.",
  addProperty: "Add a property",
} as const;
