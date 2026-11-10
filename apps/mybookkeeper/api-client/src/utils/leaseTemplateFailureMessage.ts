import type { LeaseTemplateFailure } from "../types/lease/lease-template-failure";
import type { LeaseTemplateFailureCopy } from "../types/lease/lease-template-failure-copy";
import { leaseTemplateDetail, leaseTemplateFailure } from "./leaseTemplateFailure";

/**
 * The refusals the server words for the person: a file too big (it names the file), a computed expression or a default
 * it can't use. Every other status, including a wrong file type, gets the fixed wording.
 */
const SERVER_WORDED: readonly LeaseTemplateFailure[] = ["tooBig", "rejected", "invalid"];

export function leaseTemplateFailureMessage(error: unknown, copy: LeaseTemplateFailureCopy): { failure: LeaseTemplateFailure; message: string } {
  const failure = leaseTemplateFailure(error);
  return { failure, message: (SERVER_WORDED.includes(failure) ? leaseTemplateDetail(error) : null) ?? copy[failure] };
}
