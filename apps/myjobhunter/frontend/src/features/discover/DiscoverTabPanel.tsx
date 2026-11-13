import type { ReactNode } from "react";
import { DISCOVER_TABPANEL_ID, discoverTabId } from "@/constants/discover-tabs";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

interface DiscoverTabPanelProps {
  activeView: DiscoverView;
  children: ReactNode;
}

/** The content of the active Discover tab, named by that tab. */
export default function DiscoverTabPanel({ activeView, children }: DiscoverTabPanelProps) {
  return (
    <div role="tabpanel" id={DISCOVER_TABPANEL_ID} aria-labelledby={discoverTabId(activeView)}>
      {children}
    </div>
  );
}
