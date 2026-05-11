import DiscoverTabButton from "@/features/discover/DiscoverTabButton";
import type { DiscoverView } from "@/types/discovery/discover-view";

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
      aria-label="Discover views"
      className="flex gap-1 border-b border-border"
    >
      <DiscoverTabButton
        label="Inbox"
        view="inbox"
        activeView={activeView}
        onSelect={onSelect}
      />
      <DiscoverTabButton
        label="Saved"
        view="saved"
        activeView={activeView}
        onSelect={onSelect}
      />
    </div>
  );
}
