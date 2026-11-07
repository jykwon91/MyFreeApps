import { useId, useState, type ReactNode } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { filtersToggleLabel } from "@/shared/utils/filters-toggle-label";
import { FILTER_PANEL_BREAKPOINT_CLASSES } from "@/shared/lib/filter-panel-breakpoint-classes";
import type { FilterPanelBreakpoint } from "@/shared/types/ui/filter-panel-breakpoint";
import Badge from "@/shared/components/ui/Badge";

export interface CollapsibleFiltersProps {
  activeCount: number;
  breakpoint: FilterPanelBreakpoint;
  children: ReactNode;
}

/**
 * Renders the filter controls once. Below the breakpoint they sit behind a
 * Filters toggle; at and above it they always show and the toggle is hidden.
 */
export default function CollapsibleFilters({ activeCount, breakpoint, children }: CollapsibleFiltersProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const classes = FILTER_PANEL_BREAKPOINT_CLASSES[breakpoint];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={filtersToggleLabel(activeCount)}
        className={cn(
          classes.toggle,
          "inline-flex items-center gap-1.5 min-h-[44px] px-3 text-sm font-medium border rounded-md bg-background hover:bg-muted transition-colors",
        )}
      >
        <Filter size={14} aria-hidden />
        Filters
        {activeCount > 0 && <Badge label={String(activeCount)} color="blue" />}
      </button>
      <div
        id={panelId}
        className={cn("flex-wrap items-center gap-2 mt-2", classes.panel, open ? "flex" : "hidden")}
      >
        {children}
      </div>
    </div>
  );
}
