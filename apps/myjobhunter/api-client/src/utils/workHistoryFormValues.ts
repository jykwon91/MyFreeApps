import type { WorkHistory } from "../types/work-history/work-history";
import type { WorkHistoryFormValues } from "../types/work-history/work-history-form-values";
import { bulletsToText } from "./bulletsToText";

/** The form's starting values: the role being edited, or blank for a new one. */
export function workHistoryFormValues(existing?: WorkHistory): WorkHistoryFormValues {
  return {
    company_name: existing?.company_name ?? "",
    title: existing?.title ?? "",
    start_date: existing?.start_date ?? "",
    end_date: existing?.end_date ?? "",
    is_current: existing?.is_current ?? false,
    bullets: existing ? bulletsToText(existing.bullets) : "",
  };
}
