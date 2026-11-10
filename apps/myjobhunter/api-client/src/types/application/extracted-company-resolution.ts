import type { Company } from "../company";
import type { CompanyCreateRequest } from "../company-create-request";

/** What to do with a company name read off a posting. */
export type ExtractedCompanyResolution =
  | { kind: "none" }
  | { kind: "existing"; company: Company }
  | { kind: "create"; request: CompanyCreateRequest };
