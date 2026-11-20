import type { Company } from "@myjobhunter/api-client/types/company";

export interface CompanyPickerSheetProps {
  isOpen: boolean;
  /** What the search starts on, like the company the posting named. */
  initialQuery: string;
  onSelect: (company: Company) => void;
  /** Takes the typed name as a new company, added when the application is saved. */
  onAdd: (name: string) => void;
  onClose: () => void;
}
