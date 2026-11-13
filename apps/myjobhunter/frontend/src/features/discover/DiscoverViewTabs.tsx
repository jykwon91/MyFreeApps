import DiscoverTabButton from "@/features/discover/DiscoverTabButton";
import { DISCOVER_VIEW_LABELS, DISCOVER_VIEWS } from "@myjobhunter/api-client/constants/discoverViewLabels";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

interface DiscoverViewTabsProps {
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
}

export default function DiscoverViewTabs({
  activeView,
  onSelect,
}: DiscoverViewTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Discovery views"
      className="flex gap-1 border-b border-border"
    >
      {DISCOVER_VIEWS.map((view) => (
        <DiscoverTabButton
          key={view}
          label={DISCOVER_VIEW_LABELS[view]}
          view={view}
          activeView={activeView}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
