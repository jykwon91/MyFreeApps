import type { Company } from "@myjobhunter/api-client/types/company";
import type { CompanyDeleteState } from "@myjobhunter/api-client/types/company/company-delete-state";

export interface CompanyDeleteActionProps {
  company: Company;
  /** From the company's applications: Delete waits for them to load, and stays off while there are any. */
  deleteState: CompanyDeleteState;
  /** The delete has landed and the screen is going back. */
  isLeaving: boolean;
  /** The delete landed, or the company was already gone: leave the screen. */
  onDeleted: () => void;
  /** The server refused because applications still use the company: reload them so Delete turns off. */
  onRefused: () => void;
}
