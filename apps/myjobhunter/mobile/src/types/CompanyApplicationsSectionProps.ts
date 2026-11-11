import type { ApplicationsPagesState } from "@myjobhunter/api-client/types/application/applications-pages-state";
import type { ApplicationSortKey } from "./ApplicationSortKey";

export interface CompanyApplicationsSectionProps {
  companyName: string;
  list: ApplicationsPagesState;
  sortKey: ApplicationSortKey;
  onSortChange: (sortKey: ApplicationSortKey) => void;
}
