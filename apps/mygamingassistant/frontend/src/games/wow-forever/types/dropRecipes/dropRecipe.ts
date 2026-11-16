import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { DropRecipeSource } from "@/games/wow-forever/types/dropRecipes/dropRecipeSource";
import type { RandomDrop } from "@/games/wow-forever/types/dropRecipes/randomDrop";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";
import type { DropMob } from "@/games/wow-forever/types/recipeSources";

/** A recipe whose Pattern / Formula / Plans no vendor sells and no quest gives: mobs drop it (Classic data). */
export interface DropRecipe {
  /** `${profession}:${spell}`. */
  key: string;
  profession: CraftingProfession;
  spell: number;
  name: string;
  icon: WowIcon | null;
  /** The skill to learn it. */
  skill: number;
  /** The recipe item that drops. */
  item: { id: number; name: string };
  /** The recipe item binds when picked up: you loot it yourself, it never reaches the Auction House. */
  bindOnPickup: boolean;
  /** Every kind of place it drops, in `DROP_RECIPE_SOURCE` order. */
  sources: readonly DropRecipeSource[];
  /** Open-world mobs worth hunting for it, best chance first. */
  targets: readonly DropMob[];
  /** More open-world mobs drop it than `targets` lists. */
  moreTargets: number;
  /** Dungeon / raid mobs that drop it, best chance first. */
  instanceDrops: readonly InstanceDrop[];
  /** Null unless many mobs drop it at random. */
  random: RandomDrop | null;
  /** The best percent per kill among `targets` and `instanceDrops`; 0 when it's only a random drop. */
  bestChance: number;
}
