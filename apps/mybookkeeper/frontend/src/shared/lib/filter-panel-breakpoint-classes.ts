import type { FilterPanelBreakpoint } from "@/shared/types/ui/filter-panel-breakpoint";
import type { FilterPanelBreakpointClasses } from "@/shared/types/ui/filter-panel-breakpoint-classes";

// Literal class names so Tailwind's scanner keeps them in the build.
export const FILTER_PANEL_BREAKPOINT_CLASSES: Record<FilterPanelBreakpoint, FilterPanelBreakpointClasses> = {
  sm: { toggle: "sm:hidden", panel: "sm:flex sm:mt-0" },
  md: { toggle: "md:hidden", panel: "md:flex md:mt-0" },
};
