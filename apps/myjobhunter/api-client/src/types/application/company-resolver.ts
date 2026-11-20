import type { ExtractedCompanyHints } from "./extracted-company-hints";
import type { ReadCompanyOutcome } from "./read-company-outcome";
import type { ReviewCompanyState } from "./review-company-state";

/** Whether the read or save that asked is still wanted. False once its dialog or screen has gone. */
export type IsCurrent = () => boolean;

/**
 * Matching the company of an application being added, and adding it when it's saved. Shared by the
 * web dialog and the phone. Nothing is added before Save, so a form closed without saving adds nothing.
 */
export interface CompanyResolver {
  /** Matches the company a read posting names against every tracked company; one not tracked is left new, for Save to add. */
  resolveReadCompany: (
    name: string | null,
    hints: ExtractedCompanyHints,
    isCurrent: IsCurrent,
  ) => Promise<ReadCompanyOutcome>;
  /**
   * The id to save under. A company not tracked yet is matched first against the companies fetched afresh
   * (by name, then by domain, to find one added in another tab), and only added when there's none; when the
   * add is refused because another company already has its domain, that company is used. Starts the new
   * company's background research. Null when there's no company. Throws when the add fails, or the name is
   * too long to add (no request sent). Runs to the end once started, so a company added is always used.
   */
  companyIdForSave: (company: ReviewCompanyState) => Promise<string | null>;
}
