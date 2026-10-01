import { AlertBox, Button } from "@platform/ui";
import CraftRouteList from "@/games/wow-forever/components/crafting/CraftRouteList";
import CraftShoppingList from "@/games/wow-forever/components/crafting/CraftShoppingList";
import CraftSkillInput from "@/games/wow-forever/components/crafting/CraftSkillInput";
import CraftingTrainerList from "@/games/wow-forever/components/crafting/CraftingTrainerList";
import ForeverChangesBox from "@/games/wow-forever/components/professions/ForeverChangesBox";
import HowToSteps from "@/games/wow-forever/components/professions/HowToSteps";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { currentEntryIndex, resolveRoute, totalCrafts } from "@/games/wow-forever/crafting/craftRoute";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS, CRAFTING_TRAINERS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { useCraftingData, type CraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import { useCraftingSkill } from "@/games/wow-forever/hooks/useCraftingSkill";
import type { CraftingProfession, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftingGuideViewProps {
  profession: CraftingProfession;
  faction: PlayerFaction;
  zoneId: number | null;
}

/** "Craft Woolen Cape until 95." — what the route says for your skill. */
function statusLine(entries: readonly ResolvedRouteEntry[], current: number | null): string | null {
  if (current === null) return null;
  const entry = entries[current];
  if (!entry) return "You're past the end of this route.";
  if (entry.kind === "options") return `You're on the last stretch: ${entry.step.title}.`;
  return `Craft ${entry.recipe.name} until ${entry.step.to}.`;
}

function RouteSections({ profession, faction, zoneId, data }: CraftingGuideViewProps & { data: CraftingData }) {
  const guide = CRAFTING_GUIDES[profession];
  const [skill, setSkill] = useCraftingSkill(profession);
  const entries = resolveRoute(CRAFTING_ROUTES[profession], data.recipes, data.trainerSkills);
  const current = currentEntryIndex(entries, skill);
  const currentEntry = current === null ? undefined : entries[current];
  const place = { sources: data.sources, faction, zoneId };
  return (
    <>
      <GuideSection id="route" title="Leveling route" intro={`${guide.routeIntro} About ${totalCrafts(entries)} crafts in all.`}>
        <CraftSkillInput
          skill={skill}
          onChange={setSkill}
          currentRowId={currentEntry ? `craft-${currentEntry.step.from}` : null}
          status={statusLine(entries, current)}
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
        <CraftShoppingList entries={entries} skill={skill} file={data.file} professionLabel={guide.label} note={guide.shoppingNote} />
      </GuideSection>
    </>
  );
}

function RouteSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the leveling route">
      <div className="h-8 w-48 rounded-md bg-muted/40 animate-pulse" aria-hidden />
      <div className="h-16 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
      <div className="h-96 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
    </div>
  );
}

/** Tailoring / Enchanting: train it, the route to 300 for your skill, the shopping list, and what Forever changed. */
export default function CraftingGuideView({ profession, faction, zoneId }: CraftingGuideViewProps) {
  const guide = CRAFTING_GUIDES[profession];
  const state = useCraftingData(profession);
  return (
    <>
      <GuideSection
        id="start"
        title="Get started: train it first"
        intro={`Find a ${guide.label} trainer — the recipes below unlock as your skill goes up.`}
      >
        <CraftingTrainerList trainers={CRAFTING_TRAINERS[profession]} faction={faction} />
        <HowToSteps steps={guide.steps} />
      </GuideSection>

      {state.status === "loading" ? <RouteSkeleton /> : null}
      {state.status === "error" ? (
        <AlertBox variant="error">
          <p>The leveling route didn't load.</p>
          <Button variant="secondary" onClick={state.retry} className="mt-2">
            Retry
          </Button>
        </AlertBox>
      ) : null}
      {state.status === "ready" ? <RouteSections profession={profession} faction={faction} zoneId={zoneId} data={state.data} /> : null}

      <GuideSection id="forever" title="What's different in Forever">
        <ForeverChangesBox changes={guide.forever} />
      </GuideSection>
    </>
  );
}
