import type { RemoteType } from "./remote-type";
import type { SalaryPeriod } from "./salary-period";

/** What the person reviews and edits before an application is added. */
export interface AddApplicationFormValues {
  role_title: string;
  location: string;
  remote_type: RemoteType;
  notes: string;
  /** The local calendar day they applied, "YYYY-MM-DD"; today unless they change it. */
  applied_on: string;
  /** The posted salary range as typed; blank when the posting gives none. */
  posted_salary_min: string;
  posted_salary_max: string;
  /** "" when the posting doesn't say what the salary is per. */
  posted_salary_period: SalaryPeriod | "";
  /** The ISO code the posting's salary is in; shown, not edited. */
  posted_salary_currency: string;
}
