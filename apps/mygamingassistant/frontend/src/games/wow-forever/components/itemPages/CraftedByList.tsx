import { Link } from "react-router-dom";
import RecipeLearnDetail from "@/games/wow-forever/components/recipes/RecipeLearnDetail";
import ItemCountList from "@/games/wow-forever/components/shared/ItemCountList";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { useRecipeLookup } from "@/games/wow-forever/hooks/useRecipeLookup";
import { useVendorPlace } from "@/games/wow-forever/hooks/useVendorPlace";
import { craftedLine, craftingGuideHref, professionLabel } from "@/games/wow-forever/lib/itemPages/craftedText";
import { findRecipeEntry } from "@/games/wow-forever/lib/recipes/recipeEntryLookup";
import type { CraftedBy } from "@/games/wow-forever/types/itemPages/craftedBy";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftedByListProps {
  crafted: readonly CraftedBy[];
  /** The item the recipes make. */
  itemId: number;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

/** The recipes that make it, each with where to learn it (trainers or the pattern's sources) and its crafting guide. */
export default function CraftedByList({ crafted, itemId, faction, zoneId, level }: CraftedByListProps) {
  const lookup = useRecipeLookup();
  const place = useVendorPlace(faction, zoneId, null);
  return (
    <ul className="space-y-3">
      {crafted.map((c) => {
        const entry = lookup ? findRecipeEntry(lookup, c.profession, c.spell, c.recipe) : null;
        return (
          <li key={`${c.profession}-${c.spell}`} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm">
                  <span className="font-medium">
                    <ItemIcon itemId={itemId} />
                    {c.recipe}
                  </span>
                  <span className="text-muted-foreground"> · {entry ? `${professionLabel(c.profession)} ${c.skill}` : craftedLine(c)}</span>
                </p>
                {c.reagents.length ? <p className="text-xs text-muted-foreground">
                    <ItemCountList items={c.reagents} countMark=" ×" />
                  </p> : null}
              </div>
              <Link to={craftingGuideHref(c)} className={`${DETAIL_LINK} min-h-[44px] inline-flex items-center`}>
                Crafting guide
              </Link>
            </div>
            {entry ? (
              <div className="border-l-2 border-border pl-3" data-testid="crafted-learn">
                <RecipeLearnDetail entry={entry} place={place} zoneId={zoneId} level={level} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
