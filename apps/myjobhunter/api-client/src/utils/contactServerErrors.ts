import { EMPTY_CONTACT_FORM_VALUES } from "../constants/emptyContactFormValues";
import type { ContactFormField } from "../types/contact/contact-form-field";
import type { ContactServerErrors } from "../types/contact/contact-server-errors";

const UNPROCESSABLE = 422;
/** Pydantic's prefix on messages raised from a validator. */
const VALUE_ERROR_PREFIX = /^Value error,\s*/;

function isContactFormField(value: unknown): value is ContactFormField {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EMPTY_CONTACT_FORM_VALUES, value);
}

/**
 * The fields a 422 from POST /applications/{id}/contacts blamed, with the server's message for each:
 * `detail[].loc` like `["body", "email"]`. Empty for any other failure, or a 422 that names no field
 * (the name-or-email rule is reported on the whole body), so the caller shows its general message.
 */
export function contactServerErrors(error: unknown): ContactServerErrors {
  if (typeof error !== "object" || error === null || !("status" in error) || error.status !== UNPROCESSABLE) return {};
  const data: unknown = "data" in error ? error.data : undefined;
  const detail: unknown = typeof data === "object" && data !== null && "detail" in data ? data.detail : undefined;
  if (!Array.isArray(detail)) return {};
  const errors: ContactServerErrors = {};
  for (const item of detail as unknown[]) {
    if (typeof item !== "object" || item === null || !("loc" in item) || !Array.isArray(item.loc)) continue;
    const [where, field] = item.loc as unknown[];
    if (where !== "body" || !isContactFormField(field) || errors[field]) continue;
    const msg = "msg" in item && typeof item.msg === "string" ? item.msg.replace(VALUE_ERROR_PREFIX, "") : "";
    if (msg !== "") errors[field] = msg;
  }
  return errors;
}
