import type { ApplicationCreateRequest } from "../types/application-create-request";
import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import type { ApplicationCreateContext } from "../types/application/application-create-context";

/** The POST /applications body for a reviewed form. Blank optional fields go as null. */
export function buildApplicationCreateRequest(
  values: AddApplicationFormValues,
  { companyId, sourceUrl, jdText }: ApplicationCreateContext,
): ApplicationCreateRequest {
  return {
    company_id: companyId,
    role_title: values.role_title.trim(),
    url: sourceUrl,
    location: values.location.trim() || null,
    remote_type: values.remote_type,
    notes: values.notes.trim() || null,
    jd_text: jdText.trim() || null,
  };
}
