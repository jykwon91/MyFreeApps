import { Tabs, type TabOption } from "@platform/ui";
import { DISCOVER_TABLIST_LABEL, DISCOVER_TABS_ID_PREFIX } from "@/constants/discover-tabs";
import { DISCOVER_VIEW_LABELS, DISCOVER_VIEWS } from "@myjobhunter/api-client/constants/discoverViewLabels";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

interface DiscoverViewTabsProps {
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
}

const DISCOVER_TAB_OPTIONS: ReadonlyArray<TabOption<DiscoverView>> = DISCOVER_VIEWS.map((view) => ({
  value: view,
  label: DISCOVER_VIEW_LABELS[view],
}));

/**
 * The Discover view tabs, with automatic activation: arrowing to a tab selects it, as the view change is
 * only a URL param flip over cached lists.
 */
export default function DiscoverViewTabs({ activeView, onSelect }: DiscoverViewTabsProps) {
  return (
    <Tabs
      tabs={DISCOVER_TAB_OPTIONS}
      value={activeView}
      onChange={onSelect}
      idPrefix={DISCOVER_TABS_ID_PREFIX}
      ariaLabel={DISCOVER_TABLIST_LABEL}
      className="flex gap-1 border-b border-border"
      tabClassName={(selected) =>
        [
          "min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
          selected
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
        ].join(" ")}
    />
  );
}
