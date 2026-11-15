import { useMemo } from "react";
import { DEFAULT_START_ZONE } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { readKnownFormulas, useExcludedSlots, usePriceOverrides } from "@/games/wow-forever/hooks/useCraftPrices";
import { useCraftingDataSet } from "@/games/wow-forever/hooks/useCraftingDataSet";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useTravelSettings } from "@/games/wow-forever/hooks/useTravelSettings";
import { useWorldMapData } from "@/games/wow-forever/hooks/useWorldMapData";
import { auctioneerOptions } from "@/games/wow-forever/lib/goalPlanner/auctioneerOptions";
import { buildGoalPlan } from "@/games/wow-forever/lib/goalPlanner/buildGoalPlan";
import { startPlace, stopTravel } from "@/games/wow-forever/lib/goalPlanner/stopTravel";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import type { GoalPlanState } from "@/games/wow-forever/types/goalPlanner/goalPlanState";
import type { GoalPlannerGoals } from "@/games/wow-forever/types/goalPlanner/goalPlannerGoals";
import type { RecipeBookState } from "@/games/wow-forever/types/recipes/recipeBookState";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

const NO_RECIPES: readonly RecipeEntry[] = [];

/**
 * The Goal planner's plan: every crafting file the goals need, the World Map,
 * today's auction prices (nobody types a price) and your saved settings —
 * faction, spot, level, flights, formulas you've ticked — worked into one plan.
 */
export function useGoalPlan(goals: GoalPlannerGoals, book: RecipeBookState): GoalPlanState {
  const [player] = usePlayerSettings();
  const travel = useTravelSettings();
  const world = useWorldMapData();
  const auction = useAuctionPrices();
  const overrides = usePriceOverrides();
  const [excludedSlots] = useExcludedSlots();
  const knownFormulas = useMemo(() => readKnownFormulas(), []);
  const craftingProfessions = useMemo(
    () => goals.professions.map((g) => g.profession).filter(isCraftingProfession),
    [goals.professions],
  );
  const crafting = useCraftingDataSet(craftingProfessions);
  const needsBook = goals.recipes.length > 0;
  const entries = book.status === LOAD_STATUS.ready ? book.entries : NO_RECIPES;
  const pricesSettled = auction.status !== LOAD_STATUS.loading;
  const ready = world.data !== null && crafting.status === LOAD_STATUS.ready && pricesSettled && (!needsBook || book.status === LOAD_STATUS.ready);

  const plan = useMemo(() => {
    if (!ready || !world.data) return null;
    const faction = player.faction;
    const start = startPlace(player, DEFAULT_START_ZONE[faction], world.data);
    if (!start) return null;
    return buildGoalPlan({
      goals,
      crafting: crafting.data,
      recipeBook: entries,
      auction: auction.prices,
      overrides: overrides.prices,
      knownFormulas,
      excludedSlots,
      faction,
      level: player.level,
      auctioneers: auctioneerOptions(world.data, faction),
      model: stopTravel(world.data, faction, travel.options),
      start,
      endpointOf: (place) => place.endpoint,
    });
  }, [ready, world.data, player, goals, crafting.data, entries, auction.prices, overrides.prices, knownFormulas, excludedSlots, travel.options]);

  if (world.status === LOAD_STATUS.error) return { status: LOAD_STATUS.error, retry: world.retry };
  if (crafting.status === LOAD_STATUS.error) return { status: LOAD_STATUS.error, retry: crafting.retry };
  if (needsBook && book.status === LOAD_STATUS.error) return { status: LOAD_STATUS.error, retry: book.retry };
  if (!plan) return { status: LOAD_STATUS.loading };
  return { status: LOAD_STATUS.ready, plan, withoutPrices: auction.prices === null };
}
