import type { SortingState } from "@platform/ui";
import type { ApplicationsPagesState } from "@myjobhunter/api-client/types/application/applications-pages-state";

export interface CompanyApplicationsProps {
  companyName: string;
  list: ApplicationsPagesState;
  onSortingChange: (sorting: SortingState) => void;
  onOpen: (applicationId: string) => void;
}
