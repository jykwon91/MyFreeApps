import type { Faction } from "@/games/wow-forever/types/worldMap";
import type { NearVendor } from "@/games/wow-forever/types/recipeVendors/nearVendor";
import type { RecipeBuy } from "@/games/wow-forever/types/recipeVendors/recipeBuy";

/** Where to buy one of a row's recipes: the nearest vendor you can use, or the faction whose vendors are the only ones. */
export type NearestBuy =
  | { kind: "vendor"; buy: RecipeBuy; near: NearVendor }
  | { kind: "otherFaction"; buy: RecipeBuy; faction: Faction };
