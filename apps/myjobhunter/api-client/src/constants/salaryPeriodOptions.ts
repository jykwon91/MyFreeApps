import type { SalaryPeriod } from "../types/application/salary-period";

/** The pay periods an application's posted salary can be per, plus none for a posting that doesn't say. */
export const SALARY_PERIOD_OPTIONS: readonly { value: SalaryPeriod | ""; label: string }[] = [
  { value: "", label: "Not given" },
  { value: "annual", label: "Per year" },
  { value: "monthly", label: "Per month" },
  { value: "hourly", label: "Per hour" },
];
