import { ADD_APPLICATION_FORM_PROBLEMS as PROBLEMS, POSTED_SALARY_MAX_AMOUNT } from "../constants/addApplicationForm";
import type { AddApplicationFormProblems } from "../types/application/add-application-form-problems";
import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import { postedSalaryAmount } from "./postedSalaryAmount";

function amountProblem(text: string): string | undefined {
  const amount = postedSalaryAmount(text);
  if (amount === undefined) return PROBLEMS.salaryNotAnAmount;
  if (amount !== "" && Number(amount) > POSTED_SALARY_MAX_AMOUNT) return PROBLEMS.salaryTooLarge;
  return undefined;
}

/** What the backend would refuse in a posted salary range: an amount it can't read or store, or a top below the bottom. */
export function postedSalaryProblems(
  values: Pick<AddApplicationFormValues, "posted_salary_min" | "posted_salary_max">,
): Pick<AddApplicationFormProblems, "posted_salary_min" | "posted_salary_max"> {
  const minProblem = amountProblem(values.posted_salary_min);
  const maxProblem = amountProblem(values.posted_salary_max);
  const problems: Pick<AddApplicationFormProblems, "posted_salary_min" | "posted_salary_max"> = {};
  if (minProblem) problems.posted_salary_min = minProblem;
  if (maxProblem) problems.posted_salary_max = maxProblem;
  if (minProblem || maxProblem) return problems;
  const min = postedSalaryAmount(values.posted_salary_min);
  const max = postedSalaryAmount(values.posted_salary_max);
  if (min && max && Number(min) > Number(max)) problems.posted_salary_max = PROBLEMS.salaryMinAboveMax;
  return problems;
}
