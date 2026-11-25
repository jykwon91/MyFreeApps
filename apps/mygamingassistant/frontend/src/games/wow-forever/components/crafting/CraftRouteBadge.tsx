import { Badge } from "@platform/ui";
import { CRAFT_ROUTE_BADGE_LABEL } from "@/games/wow-forever/data/professions/crafting/craftRouteModeOptions";
import { CRAFT_ROUTE_MODE, type CraftRouteMode } from "@/games/wow-forever/types/craftRouteMode";

/** Which route is showing: the cheapest or the most profitable at auction prices, or the default. */
export default function CraftRouteBadge({ shown }: { shown: CraftRouteMode }) {
  return <Badge label={CRAFT_ROUTE_BADGE_LABEL[shown]} color={shown === CRAFT_ROUTE_MODE.default ? "gray" : "green"} />;
}
