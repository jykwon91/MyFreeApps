import type { DiscoveredJob } from "./discovered-job";

export interface DiscoveredJobListResponse {
  items: DiscoveredJob[];
  total: number;
  state: "inbox" | "saved" | "all";
}
