import { useSearchParams } from "react-router-dom";
import FishRecipesList from "@/games/wow-forever/components/professions/FishRecipesList";
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
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const PROFESSION_PARAM = "p";

const PROFESSION_OPTIONS: readonly { id: Profession; label: string }[] = [
  { id: PROFESSION.cooking, label: "Cooking" },
  { id: PROFESSION.fishing, label: "Fishing" },
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

function parseProfession(raw: string | null): Profession {
  return raw === PROFESSION.fishing ? PROFESSION.fishing : PROFESSION.cooking;
}

/** /wow-forever/professions — how to train Cooking and Fishing and the fastest route to 300. */
export default function WowProfessionsPage() {
  const [params, setParams] = useSearchParams();
  const profession = parseProfession(params.get(PROFESSION_PARAM));
  const [player, updatePlayer] = usePlayerSettings();
  const view = VIEWS[profession];

  function selectProfession(next: Profession) {
    setParams({ [PROFESSION_PARAM]: next }, { replace: true });
  }

  return (
    <main className="p-4 sm:p-8 space-y-8 max-w-4xl">
      <WowPageHeader
        title="Cooking & Fishing"
        subtitle={`${PROFESSIONS_DATA_STATUS.stage} · checked ${PROFESSIONS_DATA_STATUS.checkedOn}`}
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <SegmentedToggle label="Profession" options={PROFESSION_OPTIONS} value={profession} onChange={selectProfession} />
          <SegmentedToggle
            label="Faction"
            options={FACTION_OPTIONS}
            value={player.faction}
            onChange={(faction) => updatePlayer({ faction })}
          />
        </div>
        <GuideSectionNav sections={SECTIONS} />
      </div>

      <GuideSection
        id="start"
        title="Get started: train it first"
        intro="Nothing shows up in your spellbook, and a fishing pole won't equip, until you've trained the profession."
      >
        <TrainerList profession={profession} faction={player.faction} />
        <HowToSteps steps={view.steps} />
      </GuideSection>

      <GuideSection id="route" title="Leveling route" intro={view.routeIntro}>
        <ProfessionRoute
          steps={view.route}
          faction={player.faction}
          columns={view.columns}
          showLegend={profession === PROFESSION.cooking}
        />
        {profession === PROFESSION.fishing ? <FishRecipesList /> : null}
      </GuideSection>

      <GuideSection id="forever" title="What's different in Forever">
        <ForeverChangesBox />
      </GuideSection>
    </main>
  );
}
