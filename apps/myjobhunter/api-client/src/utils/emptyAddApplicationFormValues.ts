import { localToday } from "@platform/core/utils/localToday";
import { DEFAULT_SALARY_CURRENCY } from "../constants/discoveredJobLabels";
import type { AddApplicationFormValues } from "../types/application/add-application-form-values";

/** A blank add form, applied today where the person is. A function, so "today" is read when the form opens. */
export function emptyAddApplicationFormValues(): AddApplicationFormValues {
  return {
    role_title: "",
    location: "",
    remote_type: "unknown",
    notes: "",
    applied_on: localToday(),
    posted_salary_min: "",
    posted_salary_max: "",
    posted_salary_period: "",
    posted_salary_currency: DEFAULT_SALARY_CURRENCY,
  };
}
