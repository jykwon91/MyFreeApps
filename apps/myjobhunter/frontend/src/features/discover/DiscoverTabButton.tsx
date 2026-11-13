import type { Ref } from "react";
import { DISCOVER_TABPANEL_ID, discoverTabId } from "@/constants/discover-tabs";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

export interface DiscoverTabButtonProps {
  label: string;
  view: DiscoverView;
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
  buttonRef: Ref<HTMLButtonElement>;
}

export default function DiscoverTabButton({
  label,
  view,
  activeView,
  onSelect,
  buttonRef,
}: DiscoverTabButtonProps) {
  const isActive = view === activeView;
  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      id={discoverTabId(view)}
      aria-selected={isActive}
      aria-controls={DISCOVER_TABPANEL_ID}
      tabIndex={isActive ? 0 : -1}
      onClick={() => onSelect(view)}
      className={[
        "min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
