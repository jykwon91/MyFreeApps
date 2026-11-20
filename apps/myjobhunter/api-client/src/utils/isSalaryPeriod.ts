import { SALARY_PERIOD_OPTIONS } from "../constants/salaryPeriodOptions";
import type { SalaryPeriod } from "../types/application/salary-period";

/** True for a pay period the applications table accepts; the column is a plain string on the wire. */
export function isSalaryPeriod(value: string): value is SalaryPeriod {
  return value !== "" && SALARY_PERIOD_OPTIONS.some((option) => option.value === value);
}
