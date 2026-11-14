import { DISCOVER_TABPANEL_ID, discoverTabId } from "@/constants/discover-tabs";
import type { DiscoverTabPanelProps } from "@/types/discover/discover-tab-panel-props";

/** The content of the active Discover tab, named by that tab. */
export default function DiscoverTabPanel({ activeView, children }: DiscoverTabPanelProps) {
  return (
    <div role="tabpanel" id={DISCOVER_TABPANEL_ID} aria-labelledby={discoverTabId(activeView)}>
      {children}
    </div>
  );
}
