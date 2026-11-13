import type { TabListClasses } from "@/games/wow-forever/types/shared/tabListClasses";
import type { TabListLayout } from "@/games/wow-forever/types/shared/tabListLayout";

/** Classes for the tab row and each tab, per layout. */
export const TAB_LIST_LAYOUTS: Record<TabListLayout, TabListClasses> = {
  grid: {
    list: "grid grid-cols-4 gap-1 rounded-lg bg-muted/40 p-1",
    tab: "min-h-11 rounded-md px-2",
  },
  scroll: {
    list: "flex snap-x gap-1 overflow-x-auto rounded-lg bg-muted/40 p-1",
    tab: "min-h-11 shrink-0 snap-start whitespace-nowrap rounded-md px-4",
  },
};
