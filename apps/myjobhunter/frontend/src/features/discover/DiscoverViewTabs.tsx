import type { DiscoverView } from "@/types/discovery/discover-view";

interface ViewTabsProps {
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
}

export default function DiscoverViewTabs({ activeView, onSelect }: ViewTabsProps) {
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

interface TabButtonProps {
  label: string;
  view: DiscoverView;
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
}

function DiscoverTabButton({ label, view, activeView, onSelect }: TabButtonProps) {
  const isActive = view === activeView;
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => onSelect(view)}
      className={[
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
