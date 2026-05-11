import type { DiscoverView } from "@/types/discovery/discover-view";

export interface DiscoverTabButtonProps {
  label: string;
  view: DiscoverView;
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
}

export default function DiscoverTabButton({
  label,
  view,
  activeView,
  onSelect,
}: DiscoverTabButtonProps) {
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
