import { useRef, type KeyboardEvent } from "react";
import { DISCOVER_TABLIST_LABEL } from "@/constants/discover-tabs";
import DiscoverTabButton from "@/features/discover/DiscoverTabButton";
import { nextTabIndex } from "@platform/ui";
import { DISCOVER_VIEW_LABELS, DISCOVER_VIEWS } from "@myjobhunter/api-client/constants/discoverViewLabels";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

interface DiscoverViewTabsProps {
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
}

/**
 * The Discover view tabs, with automatic activation: arrowing to a tab selects it, as the view change is
 * only a URL param flip over cached lists. Only the active tab is in the tab order (roving tabindex).
 */
export default function DiscoverViewTabs({
  activeView,
  onSelect,
}: DiscoverViewTabsProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = DISCOVER_VIEWS.indexOf(activeView);
    const next = nextTabIndex(event.key, current, DISCOVER_VIEWS.length);
    if (next === null) return;
    event.preventDefault();
    onSelect(DISCOVER_VIEWS[next]);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={DISCOVER_TABLIST_LABEL}
      onKeyDown={handleKeyDown}
      className="flex gap-1 border-b border-border"
    >
      {DISCOVER_VIEWS.map((view, index) => (
        <DiscoverTabButton
          key={view}
          label={DISCOVER_VIEW_LABELS[view]}
          view={view}
          activeView={activeView}
          onSelect={onSelect}
          buttonRef={(element) => {
            buttons.current[index] = element;
          }}
        />
      ))}
    </div>
  );
}
