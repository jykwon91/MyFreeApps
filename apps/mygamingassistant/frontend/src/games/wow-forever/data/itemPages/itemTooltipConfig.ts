import type { Placement } from "@floating-ui/react-dom";
import type { ItemPageFacts } from "@/games/wow-forever/types/itemPages/itemPageFacts";

/** Hover this long before an item-name tooltip shows (keyboard focus shows it at once). */
export const ITEM_TOOLTIP_SHOW_DELAY_MS = 150;

/** Gap between the item name and its tooltip. */
export const ITEM_TOOLTIP_OFFSET_PX = 8;

/** The tooltip never comes closer than this to the viewport's edge. */
export const ITEM_TOOLTIP_VIEWPORT_PADDING_PX = 8;

/** Above the name first, below it when there's no room — never on top of the name. */
export const ITEM_TOOLTIP_PLACEMENT: Placement = "top-start";
export const ITEM_TOOLTIP_FALLBACK_PLACEMENTS: Placement[] = ["bottom-start", "top-end", "bottom-end"];

/** Stat lines the loading skeleton shows. */
export const ITEM_TOOLTIP_SKELETON_LINES = 5;

/** Facts for an item whose shard failed to load: its stats show without a bind line. */
export const NO_ITEM_FACTS: ItemPageFacts = { bind: null, buyPrice: null, crafted: [] };
