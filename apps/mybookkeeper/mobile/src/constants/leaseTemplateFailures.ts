import type { LeaseTemplateFailureCopy } from "@mybookkeeper/api-client/types/lease/lease-template-failure-copy";

const TRY_AGAIN = "Want to try again?";

/** For one placeholder's change. The server words its refusal of a computed expression or a default for the person, so that shows. */
export const PLACEHOLDER_SAVE_COPY: LeaseTemplateFailureCopy = {
  noResponse: "I can't reach the server, so I couldn't save that. Your changes are still here.",
  viewOnly: "You have view-only access, so I can't save this.",
  gone: "I can't find that placeholder anymore. The template may have been changed or deleted.",
  inUse: `I couldn't save that. ${TRY_AGAIN}`,
  conflict: `I couldn't save that. ${TRY_AGAIN}`,
  tooBig: `I couldn't save that. ${TRY_AGAIN}`,
  tooBigTogether: `I couldn't save that. ${TRY_AGAIN}`,
  badType: `I couldn't save that. ${TRY_AGAIN}`,
  storage: `I couldn't save that. ${TRY_AGAIN}`,
  rejected: "That computed expression isn't supported.",
  invalid: "I can't use that default value. Check where it's filled in from.",
  serverError: `I couldn't save that. ${TRY_AGAIN}`,
  other: `I couldn't save that. ${TRY_AGAIN}`,
};

export const LEASE_TEMPLATE_DELETE_COPY: LeaseTemplateFailureCopy = {
  noResponse: "I can't reach the server, so I couldn't delete that template.",
  viewOnly: "You have view-only access, so I can't delete this.",
  gone: "That template was already deleted.",
  inUse: "I can't delete this template while leases use it. End or delete those leases first.",
  conflict: "Something still depends on that template, so I couldn't delete it.",
  tooBig: `I couldn't delete that template. ${TRY_AGAIN}`,
  tooBigTogether: `I couldn't delete that template. ${TRY_AGAIN}`,
  badType: `I couldn't delete that template. ${TRY_AGAIN}`,
  storage: `I couldn't delete that template. ${TRY_AGAIN}`,
  rejected: `I couldn't delete that template. ${TRY_AGAIN}`,
  invalid: `I couldn't delete that template. ${TRY_AGAIN}`,
  serverError: `I couldn't delete that template. ${TRY_AGAIN}`,
  other: `I couldn't delete that template. ${TRY_AGAIN}`,
};
