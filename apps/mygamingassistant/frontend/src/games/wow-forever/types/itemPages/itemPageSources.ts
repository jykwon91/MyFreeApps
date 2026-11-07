import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";
import type { ItemQuest } from "@/games/wow-forever/types/itemPages/itemQuest";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";

/** How an item was got in Classic (cmangos). */
export interface ItemPageSources {
  /** Vendors, open-world drops and containers (the food pages' shape); quests are `quests` below. */
  sources: ItemSources;
  quests: readonly ItemQuest[];
  instanceDrops: readonly InstanceDrop[];
  /** More dungeon / raid mobs drop it than are listed. */
  moreInstanceDrops: number;
}
