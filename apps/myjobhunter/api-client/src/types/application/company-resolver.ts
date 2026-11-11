import type { Company } from "../company";
import type { CompanyCreateRequest } from "../company-create-request";
import type { ExtractedCompanyHints } from "./extracted-company-hints";
import type { ReadCompanyOutcome } from "./read-company-outcome";
import type { ReviewCompanyState } from "./review-company-state";

/** Whether the read or save that asked is still wanted. False once its dialog or screen has gone. */
export type IsCurrent = () => boolean;

/** Matching and adding the company of an application being added. Shared by the web dialog and the phone. */
export interface CompanyResolver {
  /**
   * Adds a company and starts its background research; a research failure doesn't stop the add.
   * Throws, without sending a request, when the name is longer than a company may be called.
   */
  addCompany: (request: CompanyCreateRequest) => Promise<Company>;
  /** Matches the company a read posting names against every tracked company, adding it when there's none. */
  resolveReadCompany: (
    name: string | null,
    hints: ExtractedCompanyHints,
    isCurrent: IsCurrent,
  ) => Promise<ReadCompanyOutcome>;
  /**
   * The id to save under, adding the company whose auto-add failed unless it's tracked by now
   * (the companies are fetched afresh, to see one added in another tab). Null when there's no
   * company, or when no longer current. Throws when the add fails, or the name is too long to add (no request sent).
   */
  companyIdForSave: (company: ReviewCompanyState, isCurrent: IsCurrent) => Promise<string | null>;
}
