import { learnText } from "@/games/wow-forever/crafting/learnText";
import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import RecipeBuyLines from "@/games/wow-forever/components/recipeVendors/RecipeBuyLines";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";
import { hasSources, unknownSource } from "@/games/wow-forever/food/recipeSources";
import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingFile, LearnAt } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Where the player is, and what the guide knows about where things come from. */
export interface CraftPlace {
  sources: SourceLookup;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The player's level, to rank the mobs they can farm first. Null = not set. */
  level: number | null;
  /** Which profession makes a material, and the recipes to make this profession's own (bolts). */
  file: Pick<CraftingFile, "madeBy" | "recipes" | "smelting">;
  /** Where the player stands, to name the nearest recipe vendor. */
  vendors: VendorPlace;
}

interface CraftLearnLineProps {
  learn: LearnAt;
  professionLabel: string;
  place: CraftPlace;
}

/** How to learn a route recipe; a Pattern / Formula opens to where it's sold or dropped. */
export default function CraftLearnLine({ learn, professionLabel, place }: CraftLearnLineProps) {
  if (learn.kind !== "item") return <p className="text-sm">{learnText(learn, professionLabel)}</p>;

  const sources = place.sources.recipe(learn.itemId);
  return (
    <div className="space-y-1">
      <RecipeBuyLines buys={[{ itemId: learn.itemId, name: learn.item, sources }]} place={place.vendors} />
      <details className="text-sm group">
        <summary className="cursor-pointer min-h-[44px] sm:min-h-0 py-1 marker:text-muted-foreground">
          <span className="font-medium">{learn.item}</span> <span className="text-muted-foreground">(skill {learn.skill})</span>
        </summary>
        <div className="pt-2 space-y-1">
          {hasSources(sources) ? (
            <FoodSourceList sources={sources} faction={place.faction} zoneId={place.zoneId} level={place.level} />
          ) : (
            <p className="text-sm text-muted-foreground">{unknownSource(learn.itemId, "it")}</p>
          )}
        </div>
      </details>
    </div>
  );
}
