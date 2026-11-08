import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { ITEM_CHANGE } from "@/games/wow-forever/types/itemBrowser/itemChangeKind";
import type { ItemChangeMark } from "@/games/wow-forever/types/itemBrowser/itemChangeMark";
import { ITEM_CLASS_GROUP, type ItemClassGroup } from "@/games/wow-forever/types/itemBrowser/itemClassGroup";
import { ITEM_BROWSER_VIEW, type ItemBrowserView } from "@/games/wow-forever/types/itemBrowser/itemBrowserView";
import { SORT_DIRECTION, type SortDirection } from "@/games/wow-forever/types/itemBrowser/itemSortDirection";
import { ITEM_SORT, type ItemSortKey } from "@/games/wow-forever/types/itemBrowser/itemSortKey";

/** The item browser's (`/wow-forever/items`) fixed values: URL params, groups, labels, sizes and texts. */

/** URL params. Lists are comma-separated; unset filters are left out so the plain page has a plain URL. */
export const ITEM_BROWSER_PARAM = {
  query: "q",
  quality: "quality",
  group: "class",
  slot: "slot",
  type: "type",
  change: "change",
  requiredMin: "rmin",
  requiredMax: "rmax",
  itemLevelMin: "imin",
  itemLevelMax: "imax",
  sort: "sort",
  direction: "dir",
  view: "view",
  pages: "pages",
} as const;

export const LIST_SEPARATOR = ",";
/** Longest search the URL keeps (an item name is far shorter). */
export const ITEM_QUERY_MAX_LENGTH = 80;

export const REQUIRED_LEVEL_MIN = 1;
export const ITEM_LEVEL_MIN = 1;
/** Highest item level a filter accepts (the list's own top is under 100). */
export const ITEM_LEVEL_MAX = 300;

/** Rows added by each "Show more" — the list never draws all ~9,500 items at once. */
export const ITEM_BROWSER_PAGE_SIZE = 60;
/** Most "Show more" pages the URL can ask for (60 × 200 covers every item). */
export const ITEM_BROWSER_MAX_PAGES = 200;
/** Rows the skeleton draws while the index loads. */
export const ITEM_BROWSER_SKELETON_ROWS = 8;

export const DEFAULT_ITEM_SORT: ItemSortKey = ITEM_SORT.itemLevel;
/** Which way each sort runs until the player flips it: levels high to low, names A–Z. */
export const DEFAULT_SORT_DIRECTION: Readonly<Record<ItemSortKey, SortDirection>> = {
  [ITEM_SORT.itemLevel]: SORT_DIRECTION.desc,
  [ITEM_SORT.requiredLevel]: SORT_DIRECTION.desc,
  [ITEM_SORT.name]: SORT_DIRECTION.asc,
};
export const ITEM_SORT_OPTIONS: readonly { id: ItemSortKey; label: string }[] = [
  { id: ITEM_SORT.itemLevel, label: "Item level" },
  { id: ITEM_SORT.requiredLevel, label: "Required level" },
  { id: ITEM_SORT.name, label: "Name" },
];
export const SORT_DIRECTION_LABEL: Readonly<Record<ItemSortKey, Readonly<Record<SortDirection, string>>>> = {
  [ITEM_SORT.itemLevel]: { desc: "Highest first", asc: "Lowest first" },
  [ITEM_SORT.requiredLevel]: { desc: "Highest first", asc: "Lowest first" },
  [ITEM_SORT.name]: { asc: "A to Z", desc: "Z to A" },
};

export const DEFAULT_ITEM_VIEW: ItemBrowserView = ITEM_BROWSER_VIEW.list;
export const ITEM_VIEW_OPTIONS: readonly { id: ItemBrowserView; label: string }[] = [
  { id: ITEM_BROWSER_VIEW.list, label: "List" },
  { id: ITEM_BROWSER_VIEW.grid, label: "Grid" },
];

export const ITEM_CLASS_GROUPS: readonly ItemClassGroup[] = Object.values(ITEM_CLASS_GROUP);
export const ITEM_CLASS_GROUP_LABELS: Readonly<Record<ItemClassGroup, string>> = {
  armor: "Armor",
  weapon: "Weapons",
  off_hand: "Shields & off-hands",
  jewelry: "Jewelry & trinkets",
  cloak: "Cloaks",
  other: "Other",
};

/** Each slot's group. Shields (off hand, type Shield) move to "Shields & off-hands" in `itemClassGroup`. */
export const SLOT_CLASS_GROUP: Readonly<Record<ItemSlot, ItemClassGroup>> = {
  head: ITEM_CLASS_GROUP.armor,
  shoulder: ITEM_CLASS_GROUP.armor,
  chest: ITEM_CLASS_GROUP.armor,
  wrist: ITEM_CLASS_GROUP.armor,
  hands: ITEM_CLASS_GROUP.armor,
  waist: ITEM_CLASS_GROUP.armor,
  legs: ITEM_CLASS_GROUP.armor,
  feet: ITEM_CLASS_GROUP.armor,
  one_hand: ITEM_CLASS_GROUP.weapon,
  main_hand: ITEM_CLASS_GROUP.weapon,
  off_hand: ITEM_CLASS_GROUP.weapon,
  two_hand: ITEM_CLASS_GROUP.weapon,
  ranged: ITEM_CLASS_GROUP.weapon,
  thrown: ITEM_CLASS_GROUP.weapon,
  held_in_off_hand: ITEM_CLASS_GROUP.offHand,
  neck: ITEM_CLASS_GROUP.jewelry,
  finger: ITEM_CLASS_GROUP.jewelry,
  trinket: ITEM_CLASS_GROUP.jewelry,
  back: ITEM_CLASS_GROUP.cloak,
  shirt: ITEM_CLASS_GROUP.other,
  tabard: ITEM_CLASS_GROUP.other,
  relic: ITEM_CLASS_GROUP.other,
  other: ITEM_CLASS_GROUP.other,
};

export const SHIELD_TYPE = "Shield";
/** Armor types, listed before the weapon types in the type chips. */
export const ARMOR_TYPE_ORDER: readonly string[] = ["Cloth", "Leather", "Mail", "Plate", SHIELD_TYPE];

/** Slot chips spell out the game's word where it isn't obvious. */
export const SLOT_FILTER_HINT: Readonly<Partial<Record<ItemSlot, string>>> = {
  back: "cloaks",
  finger: "rings",
};

export const ITEM_CHANGE_MARKS: readonly ItemChangeMark[] = [ITEM_CHANGE.changed, ITEM_CHANGE.new];
export const ITEM_CHANGE_LABELS: Readonly<Record<ItemChangeMark, string>> = {
  changed: "Changed in Forever",
  new: "New in Forever",
};
/** What each mark means, for the row's title text. */
export const ITEM_CHANGE_HINTS: Readonly<Record<ItemChangeMark, string>> = {
  changed: "Item level, required level, quality, armor, damage or main stats differ from Classic Era.",
  new: "Not in the Classic Era game files.",
};

export const ITEM_BROWSER_TEXT = {
  empty: "No items match these filters.",
  loadError: "Couldn't load the item list.",
  searchLabel: "Search items by name",
  searchPlaceholder: "Item name, e.g. Lionheart Helm",
} as const;

/** The index's load states (`ItemIndexState.status`). */
export const ITEM_INDEX_STATUS = { loading: "loading", ready: "ready", error: "error" } as const;
