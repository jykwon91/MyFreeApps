import type { ReactNode } from "react";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

export interface DiscoverTabPanelProps {
  activeView: DiscoverView;
  children: ReactNode;
}
