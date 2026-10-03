import CraftPricesPanel from "@/games/wow-forever/components/crafting/CraftPricesPanel";
import CraftRouteHeader from "@/games/wow-forever/components/crafting/CraftRouteHeader";
import CraftRouteList from "@/games/wow-forever/components/crafting/CraftRouteList";
import CraftShoppingList from "@/games/wow-forever/components/crafting/CraftShoppingList";
import CraftSkillInput from "@/games/wow-forever/components/crafting/CraftSkillInput";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { currentEntryIndex, totalCrafts } from "@/games/wow-forever/crafting/craftRoute";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { CraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import { useCraftingSkill } from "@/games/wow-forever/hooks/useCraftingSkill";
import { usePricedRoute } from "@/games/wow-forever/hooks/usePricedRoute";
import { CRAFTING_PROFESSION, type CraftingProfession, type ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftRouteSectionsProps {
  profession: CraftingProfession;
  faction: PlayerFaction;
  zoneId: number | null;
  data: CraftingData;
}

/** "Craft Woolen Cape until 95." — what the shown route says for your skill. */
function statusLine(entries: readonly ResolvedRouteEntry[], current: number | null): string | null {
  if (current === null) return null;
  const entry = entries[current];
  if (!entry) return "You're past the end of this route.";
  if (entry.kind === "options") return `You're on the last stretch: ${entry.step.title}.`;
  return `Craft ${entry.recipe.name} until ${entry.step.to}.`;
}

/** The "Leveling route" and "Shopping list" sections, once the recipe data has loaded. */
export default function CraftRouteSections({ profession, faction, zoneId, data }: CraftRouteSectionsProps) {
  const guide = CRAFTING_GUIDES[profession];
  const [skill, setSkill] = useCraftingSkill(profession);
  const priced = usePricedRoute(profession, data, skill);
  const entries = priced.entries;
  const current = currentEntryIndex(entries, skill);
  const currentEntry = current === null ? undefined : entries[current];
  const place = { sources: data.sources, faction, zoneId, file: data.file };
  const slots = profession === CRAFTING_PROFESSION.enchanting ? { excluded: priced.excludedSlots, onToggle: priced.setSlot } : null;
  return (
    <>
      <GuideSection id="route" title="Leveling route" intro={`${guide.routeIntro} About ${totalCrafts(entries)} crafts in all.`}>
        <CraftSkillInput
          skill={skill}
          onChange={setSkill}
          currentRowId={currentEntry ? `craft-${currentEntry.step.from}` : null}
          status={statusLine(entries, current)}
        />
        <CraftPricesPanel
          items={priced.items}
          prices={priced.prices.prices}
          onPrice={priced.prices.setPrice}
          onReplaceAll={priced.prices.replaceAll}
          selfMadeNote={guide.pricedFromMaterials}
          formulas={priced.formulas}
          knownFormulas={priced.knownFormulas}
          onFormula={priced.setFormula}
          slots={slots}
          place={place}
        />
        <CraftRouteHeader
          cheapest={priced.cheapest}
          canCompare={priced.canCompare}
          useDefault={priced.useDefault}
          onUseDefault={priced.setUseDefault}
          pricesEntered={priced.pricesEntered}
          total={priced.total}
          unknown={priced.unknown}
        />
        <a href="#shopping" className="inline-flex items-center text-sm text-primary underline-offset-2 hover:underline min-h-[44px] sm:min-h-0">
          Jump to the shopping list
        </a>
        <CraftRouteList
          entries={entries}
          ranks={CRAFTING_RANKS[profession]}
          current={current}
          trainerSkills={data.trainerSkills}
          faction={faction}
          professionLabel={guide.label}
          place={place}
        />
      </GuideSection>
      <GuideSection id="shopping" title="Shopping list" intro="Everything the route needs, so you can gather or buy it in one go.">
        <CraftShoppingList
          entries={entries}
          skill={skill}
          place={place}
          professionLabel={guide.label}
          note={guide.shoppingNote}
          priceBook={priced.priceBook}
        />
      </GuideSection>
    </>
  );
}
