import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import { POLICY_ATTACHMENT_MESSAGES, POLICY_FORM_MESSAGES } from "../../constants/insuranceForm";

/**
 * A new policy that never got an answer, or failed on the server, may have saved anyway.
 * Saying "try again" then makes a second copy, so the host is told to look first.
 */
export function policyAddFailure(error: unknown): string {
  const status = httpStatus(error);
  if (status === undefined || status >= 500) return POLICY_FORM_MESSAGES.saveUnsure;
  if (status === 403) return INSURANCE_MESSAGES.notAllowed;
  if (status === 404) return POLICY_FORM_MESSAGES.saveGone;
  if (status === 422) return POLICY_FORM_MESSAGES.saveRejected;
  return POLICY_FORM_MESSAGES.saveFailed;
}

/** Saving the same edit twice is harmless, so an edit can simply be tried again. */
export function policyEditFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return POLICY_FORM_MESSAGES.saveOffline;
    case 403:
      return INSURANCE_MESSAGES.notAllowed;
    case 404:
      return POLICY_FORM_MESSAGES.saveGone;
    case 422:
      return POLICY_FORM_MESSAGES.saveRejected;
    default:
      return POLICY_FORM_MESSAGES.saveFailed;
  }
}

export function policyDeleteFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return INSURANCE_MESSAGES.deleteOffline;
    case 403:
      return INSURANCE_MESSAGES.notAllowed;
    case 404:
      return INSURANCE_MESSAGES.deleteGone;
    default:
      return INSURANCE_MESSAGES.deleteFailed;
  }
}

export function attachmentUploadFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return POLICY_ATTACHMENT_MESSAGES.uploadOffline;
    case 403:
      return POLICY_ATTACHMENT_MESSAGES.notAllowed;
    case 404:
      return POLICY_ATTACHMENT_MESSAGES.gone;
    case 413:
      return POLICY_ATTACHMENT_MESSAGES.tooBig;
    case 415:
      return POLICY_ATTACHMENT_MESSAGES.badType;
    default:
      return POLICY_ATTACHMENT_MESSAGES.uploadFailed;
  }
}

export function attachmentRemoveFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case 403:
      return POLICY_ATTACHMENT_MESSAGES.notAllowed;
    case 404:
      return POLICY_ATTACHMENT_MESSAGES.removeGone;
    default:
      return POLICY_ATTACHMENT_MESSAGES.removeFailed;
  }
}
