import { TabPanel } from "@platform/ui";
import { DISCOVER_TABS_ID_PREFIX } from "@/constants/discover-tabs";
import type { DiscoverTabPanelProps } from "@/types/discover/discover-tab-panel-props";

/** The content of the active Discover tab, named by that tab. */
export default function DiscoverTabPanel({ activeView, children }: DiscoverTabPanelProps) {
  return (
    <TabPanel idPrefix={DISCOVER_TABS_ID_PREFIX} value={activeView}>
      {children}
    </TabPanel>
  );
}
