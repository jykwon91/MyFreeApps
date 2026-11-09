import type { LeaseTemplateFailureCopy } from "../types/lease/lease-template-failure-copy";

const TRY_AGAIN = "Want to try again?";

/**
 * A lost answer, a timeout or a proxy error can come after the server saved, so a retry could make two.
 * The server's own sentence is shown only for a file too big (it names the file), or a refusal it words for the person.
 */
const MAY_HAVE_SAVED = "I'm not sure that uploaded. Check your templates before trying again, so you don't end up with two.";

export const LEASE_TEMPLATE_CREATE_COPY: LeaseTemplateFailureCopy = {
  noResponse: MAY_HAVE_SAVED,
  viewOnly: "You have view-only access, so I can't upload this.",
  gone: `I couldn't upload that. ${TRY_AGAIN}`,
  inUse: `I couldn't upload that. ${TRY_AGAIN}`,
  conflict: "That clashes with a template you already have. Check the name and try again.",
  tooBig: "One of those files is too large.",
  tooBigTogether: "Those files are too large to send together. Upload fewer at a time.",
  badType: "I can only use Word (.docx), Markdown (.md) or text (.txt) files.",
  storage: "File storage isn't available right now. Try again in a bit.",
  rejected: `I couldn't upload that. ${TRY_AGAIN}`,
  invalid: "Something in there isn't right. Check the name and the files, then try again.",
  serverError: MAY_HAVE_SAVED,
  other: `I couldn't upload that. ${TRY_AGAIN}`,
};
