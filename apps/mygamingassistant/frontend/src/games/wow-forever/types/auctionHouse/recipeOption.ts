import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";

/** A recipe in the Auction house page's recipe picker. */
export interface RecipeOption {
  spell: number;
  /** "Runed Copper Rod (1)": name, then the skill it turns yellow at. */
  label: string;
  /** What the recipe makes (an enchant: its spell); null when the icon map has none. */
  icon: WowIcon | null;
}
