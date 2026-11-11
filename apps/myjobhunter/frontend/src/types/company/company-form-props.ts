import type { CompanyCreateRequest } from "@myjobhunter/api-client/types/company-create-request";
import type { CompanyFormProblems } from "@myjobhunter/api-client/types/company/company-form-problems";
import type { CompanyFormValues } from "@myjobhunter/api-client/types/company/company-form-values";

export interface CompanyFormProps {
  /**
   * Saves the company. Resolve with the fields the server refused (such as a domain another
   * company has) to show those under their fields; resolve with nothing otherwise.
   */
  onSubmit: (request: CompanyCreateRequest) => Promise<CompanyFormProblems | undefined>;
  onCancel: () => void;
  submitLabel?: string;
  submitting?: boolean;
  /** Pre-fill fields — intended for future edit-in-place; no consumer uses this yet. */
  initialValues?: Partial<CompanyFormValues>;
  /** If true, focuses the name field on mount (default: true). */
  autoFocus?: boolean;
}
