export const PROPERTY_SKELETON_ROWS = ["a", "b", "c", "d", "e"];

export const PROPERTY_MESSAGES = {
  loading: "Loading your properties",
  loadingOne: "Loading this property",
  couldntLoad: "I couldn't load your properties.",
  couldntLoadOne: "I couldn't load that property.",
  cantFind: "I can't find that property.",
  maybeDeleted: "It may have been deleted.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  back: "Back",
  noneHeading: "You don't have any properties yet.",
  noneBody: "Add one, and I'll use it to organize your transactions and put expenses on the right tax forms.",
  noneViewOnlyBody: "Someone with edit access can add one.",
  add: "Add a property",
  classify: "Classify now",
  inactive: "Inactive",
  needsClassification: "Needs classification",
  activeNow: "Active",
  use: "Use",
  activityPeriods: "Active periods",
  edit: "Edit",
  deactivate: "Deactivate",
  activate: "Activate",
  deactivating: "Deactivating…",
  activating: "Activating…",
  delete: "Delete",
  deleting: "Deleting…",
  deleted: "Property deleted.",
  alreadyDeleted: "That property was already deleted.",
  activated: "Property is active again.",
  deactivated: "Property is inactive.",
} as const;

export function deletePropertyTitle(name: string): string {
  return `Delete ${name}?`;
}

export const DELETE_PROPERTY_BODY =
  "This also permanently deletes its listings and their photos, tenant and lease records, mortgages, insurance policies and utility plans. Documents, transactions and signed leases stay, but won't be linked to this property anymore.";
