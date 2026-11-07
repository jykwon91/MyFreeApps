import type { BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";

/** The item id in each filled row; a missing key is an empty row. */
export type BisListItems = Readonly<Partial<Record<BisSlotId, number>>>;
