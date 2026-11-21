import type { AddApplicationFormProblems } from "@myjobhunter/api-client/types/application/add-application-form-problems";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";
import type { FieldChain } from "@platform/mobile";
import type { ReviewStepProps } from "./ReviewStepProps";

export interface PostedSalaryFieldsProps {
  values: Pick<AddApplicationFormValues, "posted_salary_min" | "posted_salary_max" | "posted_salary_period" | "posted_salary_currency">;
  errors: Pick<AddApplicationFormProblems, "posted_salary_min" | "posted_salary_max">;
  onEdit: ReviewStepProps["onEdit"];
  disabled: boolean;
  /** The review step's fields, so Return moves through these and on. */
  fields: FieldChain<keyof AddApplicationFormValues>;
}
