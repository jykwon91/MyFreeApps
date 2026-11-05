import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import CraftSkinningList from "@/games/wow-forever/components/crafting/CraftSkinningList";
import { describeDisenchant, isGathered, soldToYou, unknownMat } from "@/games/wow-forever/crafting/matSources";
import { makerOf } from "@/games/wow-forever/crafting/shoppingList";
import { hasSources } from "@/games/wow-forever/food/recipeSources";

/** Disenchant isn't a recipe or in the spellbook — Forever keeps it in the Professions window (K). */
const DISENCHANT_HOW =
  "Disenchant isn't in the Enchanting window or your spellbook: press K, drag Disenchant from the main tab to a bar, cast it, then click the green item in your bags.";

interface CraftMatSourcesProps {
  itemId: number;
  place: CraftPlace;
  professionLabel: string;
}

/** "You make this yourself with Bolt of Linen Cloth: 2 Linen Cloth each." ("You can also make it yourself …" for leather.) */
function makeItText(itemId: number, place: CraftPlace, lead: string): string {
  const maker = makerOf(itemId, place.file.recipes);
  if (!maker) return `${lead}.`;
  const from = maker.reagents.map((r) => `${r.count} ${r.name}`).join(" + ");
  return `${lead} with ${maker.name}: ${from} each.`;
}

/** Everything known about where a material comes from: make it, disenchant, skin, buy, quest, farm. */
export default function CraftMatSources({ itemId, place, professionLabel }: CraftMatSourcesProps) {
  const madeBy = place.file.madeBy[String(itemId)] ?? null;
  const sources = place.sources.reagent(itemId);
  const own = madeBy === professionLabel;
  if (own && !isGathered(sources)) {
    return <p className="text-sm">{makeItText(itemId, place, "You make this yourself")} Its materials are on the shopping list.</p>;
  }

  const known = hasSources(sources) || madeBy !== null;
  // A vendor sells it (Copper Rod) — no need to send you to a Blacksmith.
  const askMaker = madeBy !== null && !own && !soldToYou(sources, place.faction);
  return (
    <div className="space-y-3">
      {sources.disenchant ? (
        <p className="text-sm">
          {describeDisenchant(sources.disenchant)}{" "}
          <span className="text-muted-foreground">{DISENCHANT_HOW}</span>
        </p>
      ) : null}
      {sources.skinning ? (
        <CraftSkinningList skinning={sources.skinning} faction={place.faction} zoneId={place.zoneId} level={place.level} />
      ) : null}
      {own ? <p className="text-sm text-muted-foreground">{makeItText(itemId, place, "You can also make it yourself")}</p> : null}
      {askMaker ? (
        <p className="text-sm">
          Made by {madeBy} — buy it at the auction house, or ask a player with {madeBy} to make it.
        </p>
      ) : null}
      <FoodSourceList sources={sources} faction={place.faction} zoneId={place.zoneId} level={place.level} preferEasySources />
      {known ? null : <p className="text-sm text-muted-foreground">{unknownMat(itemId)}</p>}
    </div>
  );
}
