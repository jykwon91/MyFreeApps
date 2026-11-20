/**
 * The posted salary range on the add-application review form: from, to and
 * what it's per. A pasted job description fills these in; the currency the
 * posting named is shown on the amounts but isn't edited here.
 */
import { type UseFormRegister, type FieldErrors } from "react-hook-form";
import { FieldFeedback, fieldFeedbackAria } from "@platform/ui";
import { SALARY_PERIOD_OPTIONS } from "@myjobhunter/api-client/constants/salaryPeriodOptions";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";

interface PostedSalaryFieldsProps {
  idPrefix: string;
  currency: string;
  register: UseFormRegister<AddApplicationFormValues>;
  errors: FieldErrors<AddApplicationFormValues>;
}

export default function PostedSalaryFields({ idPrefix, currency, register, errors }: PostedSalaryFieldsProps) {
  const feedback = (field: "posted_salary_min" | "posted_salary_max") => ({
    id: `${idPrefix}-${field}`,
    error: errors[field]?.message,
  });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label htmlFor={`${idPrefix}-posted_salary_min`} className="block text-sm font-medium mb-1">
          Salary from ({currency})
        </label>
        <input
          id={`${idPrefix}-posted_salary_min`}
          type="text"
          inputMode="decimal"
          {...fieldFeedbackAria(feedback("posted_salary_min"))}
          {...register("posted_salary_min")}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="e.g. 120000"
        />
        <FieldFeedback {...feedback("posted_salary_min")} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-posted_salary_max`} className="block text-sm font-medium mb-1">
          Salary to ({currency})
        </label>
        <input
          id={`${idPrefix}-posted_salary_max`}
          type="text"
          inputMode="decimal"
          {...fieldFeedbackAria(feedback("posted_salary_max"))}
          {...register("posted_salary_max")}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="e.g. 150000"
        />
        <FieldFeedback {...feedback("posted_salary_max")} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-posted_salary_period`} className="block text-sm font-medium mb-1">
          Per
        </label>
        <select
          id={`${idPrefix}-posted_salary_period`}
          {...register("posted_salary_period")}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          {SALARY_PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
