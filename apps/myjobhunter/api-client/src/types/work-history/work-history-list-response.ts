import type { WorkHistory } from "./work-history";

export interface WorkHistoryListResponse {
  items: WorkHistory[];
  total: number;
}
