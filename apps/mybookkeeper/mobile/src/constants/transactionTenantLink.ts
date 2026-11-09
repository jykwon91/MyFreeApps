import type { WriteFailureCopy } from "../types/WriteFailureCopy";

export const TENANT_LINK_MESSAGES = {
  heading: "Tenant",
  notLinked: "Not linked to a tenant",
  linkedTo: "Linked to",
  thisTenant: "a tenant",
  link: "Link to a tenant",
  relink: "Link to a different tenant",
  linking: "Linking…",
  confirmAction: "Link",
  pickerDescription: "Pick the tenant who paid this.",
  confirmBody: "This also approves the payment and marks it as rent income. Later payments from this payer will be matched to the same tenant.",
  linked: "Linked.",
} as const;

/** Fixed wording only: the server's own text is never shown. */
export const TENANT_LINK_FAILURE: WriteFailureCopy = {
  noResponse: "I can't reach the server, so I couldn't link that.",
  viewOnly: "You have view-only access, so I can't link this.",
  gone: "I can't find that transaction or tenant anymore. It may have been deleted.",
  conflict: "That clashes with how this is already linked. Refresh and try again.",
  invalid: "I can't link that payment. Check that it's income and try again.",
  serverError: "I couldn't link that. Want to try again?",
  other: "I couldn't link that. Want to try again?",
};
