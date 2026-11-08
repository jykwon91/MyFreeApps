import RecipeBuyLines from "@/games/wow-forever/components/recipeVendors/RecipeBuyLines";
import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import { routeBuys } from "@/games/wow-forever/lib/recipeVendors/routeBuys";
import type { RouteBuyPlace } from "@/games/wow-forever/types/recipeVendors/routeBuyPlace";

interface RouteBuyLinesProps {
  step: RouteStep;
  buy: RouteBuyPlace | undefined;
}

/** A route row's "Buy from" lines; nothing when the row buys nothing or the guide has no vendor data. */
export default function RouteBuyLines({ step, buy }: RouteBuyLinesProps) {
  if (!buy) return null;
  const buys = routeBuys(step, buy);
  return buys.length ? <RecipeBuyLines buys={buys} place={buy.place} /> : null;
}
