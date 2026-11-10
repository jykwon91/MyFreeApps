import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import type { JdParseResponse } from "../types/application/jd-parse-response";
import { isRemoteType } from "./isRemoteType";

/** The form fields a parsed job description fills in. Fields it didn't find are left out. */
export function prefillFromParse(result: JdParseResponse): Partial<AddApplicationFormValues> {
  const prefill: Partial<AddApplicationFormValues> = {};
  if (result.title) prefill.role_title = result.title;
  if (result.location) prefill.location = result.location;
  if (result.remote_type && isRemoteType(result.remote_type) && result.remote_type !== "unknown") {
    prefill.remote_type = result.remote_type;
  }
  return prefill;
}
