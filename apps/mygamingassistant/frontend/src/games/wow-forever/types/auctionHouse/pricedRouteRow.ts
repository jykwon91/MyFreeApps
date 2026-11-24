import type { RouteRowSource } from "@/games/wow-forever/types/crafting";
import type { AddonStep } from "@/games/wow-forever/types/professionsAddon/addonStep";

/**
 * One row of a profession's cheapest route at one house's prices, as the MGA Professions addon reads it.
 * A craft row carries what the addon needs to show it (recipe, mats, colours, where to learn it); an
 * options row ("pick what you can get") is just its skill span, and the addon shows its own hand-written one.
 */
export interface PricedRouteRow
  extends Pick<AddonStep, "from" | "to" | "name" | "spell" | "yellow" | "grey" | "mats" | "learn" | "learnSkill" | "acquire" | "note" | "confirmed"> {
  options: boolean;
  /** Expected copper for the whole row at this house; null when a material has no price. */
  cost: number | null;
  /** Picked for these prices, or the hand-written route's row. */
  source: RouteRowSource | null;
}
