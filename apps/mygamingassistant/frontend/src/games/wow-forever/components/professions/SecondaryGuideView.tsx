import { useMemo } from "react";
import FishRecipesList from "@/games/wow-forever/components/professions/FishRecipesList";
import FoodPickerLink from "@/games/wow-forever/components/professions/FoodPickerLink";
import ForeverChangesBox from "@/games/wow-forever/components/professions/ForeverChangesBox";
import HowToSteps from "@/games/wow-forever/components/professions/HowToSteps";
import ProfessionRoute from "@/games/wow-forever/components/professions/ProfessionRoute";
import TrainerList from "@/games/wow-forever/components/professions/TrainerList";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import { COOKING_ROUTE, COOKING_STEPS } from "@/games/wow-forever/data/professions/cooking";
import { FISHING_ROUTE, FISHING_STEPS } from "@/games/wow-forever/data/professions/fishing";
import { SECONDARY_FOREVER_CHANGES } from "@/games/wow-forever/data/professions/foreverChanges";
import { PROFESSION } from "@/games/wow-forever/data/professions/professionTypes";
import type { SecondaryProfession } from "@/games/wow-forever/types/secondaryProfession";
import { FOOD_SOURCES } from "@/games/wow-forever/data/food/recipeSourceData";
import CookingVendorsSection from "@/games/wow-forever/components/recipeVendors/CookingVendorsSection";
import RecipeVendorsSection from "@/games/wow-forever/components/recipeVendors/RecipeVendorsSection";
import { useVendorPlace } from "@/games/wow-forever/hooks/useVendorPlace";
import { bookRecipes, withRoute } from "@/games/wow-forever/lib/recipeVendors/collectVendorRecipes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Cooking makes nothing another profession uses, so there's no made-by or own recipe to point at. */
const NO_CRAFTS = { madeBy: {}, recipes: [] };

interface SecondaryGuideViewProps {
  profession: SecondaryProfession;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The player's level, to rank the mobs they can farm first. Null = not set. */
  level: number | null;
  /** Map percent in your zone; null = its middle. Sorts recipe vendors by distance. */
  position: { x: number; y: number } | null;
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

/** Cooking and Fishing: trainers, the route table, recipe vendors and what Forever changed. */
export default function SecondaryGuideView({ profession, faction, zoneId, level, position }: SecondaryGuideViewProps) {
  const view = VIEWS[profession];
  const vendors = useVendorPlace(faction, zoneId, position);
  const book = useMemo(() => FOOD_SOURCES.book(profession), [profession]);
  const bookOnly = useMemo(() => withRoute(bookRecipes(book), new Set(), new Set(book ? [book.itemId] : [])), [book]);
  const buy = { sources: FOOD_SOURCES, book, place: vendors };
  const matPlace = { place: { sources: FOOD_SOURCES, faction, zoneId, level, file: NO_CRAFTS, vendors }, professionLabel: "Cooking" };
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
          buy={buy}
          zoneId={zoneId}
        />
        {profession === PROFESSION.fishing ? <FishRecipesList /> : null}
        {profession === PROFESSION.cooking ? <FoodPickerLink /> : null}
      </GuideSection>

      {profession === PROFESSION.cooking ? (
        <CookingVendorsSection sources={FOOD_SOURCES} book={book} place={vendors} />
      ) : (
        <RecipeVendorsSection recipes={bookOnly} place={vendors} />
      )}

      <GuideSection id="forever" title="What's different in Forever">
        <ForeverChangesBox changes={SECONDARY_FOREVER_CHANGES[profession]} />
      </GuideSection>
    </>
  );
}
