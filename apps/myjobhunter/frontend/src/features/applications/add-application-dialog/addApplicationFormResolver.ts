/**
 * react-hook-form resolver for the add-application review form. Uses the
 * shared addApplicationFormProblems check (the phone uses the same one), so
 * the form is validated against the trimmed values that are sent — a
 * whitespace-only role title is caught inline rather than by the API.
 */
import type { FieldErrors, Resolver } from "react-hook-form";
import { addApplicationFormProblems } from "@myjobhunter/api-client/utils/addApplicationFormProblems";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";

export const addApplicationFormResolver: Resolver<AddApplicationFormValues> = (values) => {
  const problems = addApplicationFormProblems(values);
  const errors: FieldErrors<AddApplicationFormValues> = {};
  for (const field of Object.keys(problems) as (keyof AddApplicationFormValues)[]) {
    const message = problems[field];
    if (message) errors[field] = { type: "validate", message };
  }
  return Object.keys(errors).length > 0 ? { values: {}, errors } : { values, errors: {} };
};
