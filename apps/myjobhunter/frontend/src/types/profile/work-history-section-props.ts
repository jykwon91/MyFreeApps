import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";

export interface WorkHistorySectionProps {
  entries: readonly WorkHistory[];
}
