import { useSearchParams } from "react-router-dom";
import CraftingGuideView from "@/games/wow-forever/components/crafting/CraftingGuideView";
import FishRecipesList from "@/games/wow-forever/components/professions/FishRecipesList";
import FoodPickerLink from "@/games/wow-forever/components/professions/FoodPickerLink";
import ForeverChangesBox from "@/games/wow-forever/components/professions/ForeverChangesBox";
import HowToSteps from "@/games/wow-forever/components/professions/HowToSteps";
import ProfessionRoute from "@/games/wow-forever/components/professions/ProfessionRoute";
import TrainerList from "@/games/wow-forever/components/professions/TrainerList";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import GuideSectionNav from "@/games/wow-forever/components/guide/GuideSectionNav";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { COOKING_ROUTE, COOKING_STEPS } from "@/games/wow-forever/data/professions/cooking";
import { FISHING_ROUTE, FISHING_STEPS } from "@/games/wow-forever/data/professions/fishing";
import { PROFESSION, type Profession } from "@/games/wow-forever/data/professions/professionTypes";
import { PROFESSIONS_DATA_STATUS } from "@/games/wow-forever/data/professions/professionsStatus";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { CRAFTING_PROFESSION, type CraftingProfession } from "@/games/wow-forever/types/crafting";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const PROFESSION_PARAM = "p";

type GuideProfession = Profession | CraftingProfession;

const PROFESSION_OPTIONS: readonly { id: GuideProfession; label: string }[] = [
  { id: PROFESSION.cooking, label: "Cooking" },
  { id: PROFESSION.fishing, label: "Fishing" },
  { id: CRAFTING_PROFESSION.tailoring, label: "Tailoring" },
  { id: CRAFTING_PROFESSION.enchanting, label: "Enchanting" },
];

const FACTION_OPTIONS: readonly { id: PlayerFaction; label: string }[] = [
  { id: FACTION.alliance, label: "Alliance" },
  { id: FACTION.horde, label: "Horde" },
];

const SECTIONS = [
  { id: "start", label: "Get started" },
  { id: "route", label: "Leveling route" },
  { id: "forever", label: "What's different in Forever" },
] as const;

const CRAFTING_SECTIONS = [
  { id: "start", label: "Get started" },
  { id: "route", label: "Leveling route" },
  { id: "shopping", label: "Shopping list" },
  { id: "forever", label: "What's different in Forever" },
] as const;

const VIEWS = {
  cooking: {
    steps: COOKING_STEPS,
    route: COOKING_ROUTE,
    columns: { name: "Recipe", materials: "Materials", source: "Recipe from" },
    routeIntro: "Cook each recipe until it turns green, then move to the next row.",
  },
  fishing: {
    steps: FISHING_STEPS,
    route: FISHING_ROUTE,
    columns: { name: "Step", materials: "Where", source: "Spot" },
    routeIntro: "Fish in the zones for your skill. If most casts say \"fish got away\", go back a row.",
  },
} as const;

function parseProfession(raw: string | null): GuideProfession {
  return PROFESSION_OPTIONS.find((o) => o.id === raw)?.id ?? PROFESSION.cooking;
}

function isCrafting(profession: GuideProfession): profession is CraftingProfession {
  return profession === CRAFTING_PROFESSION.tailoring || profession === CRAFTING_PROFESSION.enchanting;
}

/** Cooking and Fishing: trainers, the route table and what Forever changed. */
function SecondaryGuideView({ profession, faction }: { profession: Profession; faction: PlayerFaction }) {
  const view = VIEWS[profession];
  return (
    <>
      <GuideSection
        id="start"
        title="Get started: train it first"
        intro="Nothing shows up in your spellbook, and a fishing pole won't equip, until you've trained the profession."
      >
        <TrainerList profession={profession} faction={faction} />
        <HowToSteps steps={view.steps} />
      </GuideSection>

      <GuideSection id="route" title="Leveling route" intro={view.routeIntro}>
        <ProfessionRoute steps={view.route} faction={faction} columns={view.columns} showLegend={profession === PROFESSION.cooking} />
        {profession === PROFESSION.fishing ? <FishRecipesList /> : null}
        {profession === PROFESSION.cooking ? <FoodPickerLink /> : null}
      </GuideSection>

      <GuideSection id="forever" title="What's different in Forever">
        <ForeverChangesBox />
      </GuideSection>
    </>
  );
}

/** /wow-forever/professions — how to train each profession and the fastest route to 300. */
export default function WowProfessionsPage() {
  const [params, setParams] = useSearchParams();
  const profession = parseProfession(params.get(PROFESSION_PARAM));
  const [player, updatePlayer] = usePlayerSettings();
  const crafting = isCrafting(profession);

  function selectProfession(next: GuideProfession) {
    setParams({ [PROFESSION_PARAM]: next }, { replace: true });
  }

  return (
    <main className="p-4 sm:p-8 space-y-8 max-w-4xl">
      <WowPageHeader
        title="Professions"
        subtitle={`${PROFESSIONS_DATA_STATUS.stage} · checked ${PROFESSIONS_DATA_STATUS.checkedOn}`}
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <SegmentedToggle
            label="Profession"
            options={PROFESSION_OPTIONS}
            value={profession}
            onChange={selectProfession}
            className="grid grid-cols-2 w-full sm:inline-flex sm:w-auto"
          />
          <SegmentedToggle
            label="Faction"
            options={FACTION_OPTIONS}
            value={player.faction}
            onChange={(faction) => updatePlayer({ faction })}
          />
        </div>
        <GuideSectionNav sections={crafting ? CRAFTING_SECTIONS : SECTIONS} />
      </div>

      {crafting ? (
        <CraftingGuideView profession={profession} faction={player.faction} zoneId={player.zoneId} />
      ) : (
        <SecondaryGuideView profession={profession} faction={player.faction} />
      )}
    </main>
  );
}
