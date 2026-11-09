import type { LeaseTemplateFailure } from "../types/lease/lease-template-failure";
import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

const IN_USE_CODE = "template_in_use";

function isInUse(error: unknown): boolean {
  const detail = errorDetail(error);
  return typeof detail === "object" && detail !== null && (detail as { code?: unknown }).code === IN_USE_CODE;
}

/**
 * Why a template upload, placeholder change or delete failed. A 409 is "in use" only when the server
 * says so with its `template_in_use` code (a delete refused because leases still use the template).
 */
export function leaseTemplateFailure(error: unknown): LeaseTemplateFailure {
  const status = httpStatus(error);
  switch (status) {
    case undefined:
      return "noResponse";
    case 400:
      return "rejected";
    case 403:
      return "viewOnly";
    case 404:
      return "gone";
    case 409:
      return isInUse(error) ? "inUse" : "conflict";
    case 413:
      return leaseTemplateDetail(error) ? "tooBig" : "tooBigTogether";
    case 415:
      return "badType";
    case 422:
      return "invalid";
    case 503:
      return "storage";
    default:
      return status >= 500 ? "serverError" : "other";
  }
}

/**
 * The server's own sentence for a refused write, when it sent one. For the refusals it words for the person:
 * a file too big or of the wrong type, a computed expression or default source it can't use.
 */
export function leaseTemplateDetail(error: unknown): string | null {
  const detail = errorDetail(error);
  return typeof detail === "string" && detail.trim() !== "" ? detail : null;
}
