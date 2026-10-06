import FishRecipesList from "@/games/wow-forever/components/professions/FishRecipesList";
import FoodPickerLink from "@/games/wow-forever/components/professions/FoodPickerLink";
import ForeverChangesBox from "@/games/wow-forever/components/professions/ForeverChangesBox";
import HowToSteps from "@/games/wow-forever/components/professions/HowToSteps";
import ProfessionRoute from "@/games/wow-forever/components/professions/ProfessionRoute";
import TrainerList from "@/games/wow-forever/components/professions/TrainerList";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { COOKING_ROUTE, COOKING_STEPS } from "@/games/wow-forever/data/professions/cooking";
import { FISHING_ROUTE, FISHING_STEPS } from "@/games/wow-forever/data/professions/fishing";
import { PROFESSION, type Profession } from "@/games/wow-forever/data/professions/professionTypes";
import { FOOD_SOURCES } from "@/games/wow-forever/data/food/recipeSourceData";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Cooking makes nothing another profession uses, so there's no made-by or own recipe to point at. */
const NO_CRAFTS = { madeBy: {}, recipes: [] };

interface SecondaryGuideViewProps {
  profession: Profession;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The player's level, to rank the mobs they can farm first. Null = not set. */
  level: number | null;
}

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

/** Cooking and Fishing: trainers, the route table and what Forever changed. */
export default function SecondaryGuideView({ profession, faction, zoneId, level }: SecondaryGuideViewProps) {
  const view = VIEWS[profession];
  const matPlace = { place: { sources: FOOD_SOURCES, faction, zoneId, level, file: NO_CRAFTS }, professionLabel: "Cooking" };
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
        <ProfessionRoute
          steps={view.route}
          faction={faction}
          columns={view.columns}
          showLegend={profession === PROFESSION.cooking}
          matPlace={matPlace}
        />
        {profession === PROFESSION.fishing ? <FishRecipesList /> : null}
        {profession === PROFESSION.cooking ? <FoodPickerLink /> : null}
      </GuideSection>

      <GuideSection id="forever" title="What's different in Forever">
        <ForeverChangesBox />
      </GuideSection>
    </>
  );
}
