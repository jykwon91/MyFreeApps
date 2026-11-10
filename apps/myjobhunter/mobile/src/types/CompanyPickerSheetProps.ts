import type { Company } from "@myjobhunter/api-client/types/company";

export interface CompanyPickerSheetProps {
  isOpen: boolean;
  /** What the search starts on, like the company the posting named. */
  initialQuery: string;
  onSelect: (company: Company) => void;
  /** Adds the typed name. A rejection keeps the sheet open, saying it failed. */
  onAdd: (name: string) => Promise<void>;
  onClose: () => void;
}
