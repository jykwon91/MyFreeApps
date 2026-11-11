import type { WorkHistoryCreateRequest } from "../types/work-history/work-history-create-request";
import type { WorkHistoryFormValues } from "../types/work-history/work-history-form-values";
import { bulletsFromText } from "./bulletsFromText";

/**
 * The body for adding a role, and for saving an edit (every field is sent). The server rejects a
 * current role with an end date, so a current role sends none.
 */
export function workHistoryRequest(values: WorkHistoryFormValues): WorkHistoryCreateRequest {
  return {
    company_name: values.company_name.trim(),
    title: values.title.trim(),
    start_date: values.start_date,
    end_date: values.is_current ? null : values.end_date.trim() || null,
    is_current: values.is_current,
    bullets: bulletsFromText(values.bullets),
  };
}
