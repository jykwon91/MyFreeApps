import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import PlanLegLine from "@/games/wow-forever/components/goalPlanner/PlanLegLine";
import PlanStopIcon from "@/games/wow-forever/components/goalPlanner/PlanStopIcon";
import PlanTaughtList from "@/games/wow-forever/components/goalPlanner/PlanTaughtList";
import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { routeThereHref } from "@/games/wow-forever/lib/goalPlanner/routeThereHref";
import type { OrderedStop } from "@/games/wow-forever/types/goalPlanner/orderedStop";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface PlanStopCardProps {
  ordered: OrderedStop;
  /** Its place in the whole route, from 1. */
  number: number;
  faction: PlayerFaction;
}

/** One stop on the route: what to do, who and where, how to get there, and a link to the World Map's directions. */
export default function PlanStopCard({ ordered, number, faction }: PlanStopCardProps) {
  const { stop, option, leg } = ordered;
  return (
    <li className="rounded-lg border bg-card p-3 space-y-1" data-testid="plan-stop">
      <PlanLegLine leg={leg} />
      <div className="flex items-start gap-3">
        <span className="mt-1 w-5 shrink-0 text-right text-sm font-semibold text-muted-foreground">{number}</span>
        <PlanStopIcon stop={stop} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium" data-testid="plan-stop-title">
            {stop.title}
          </p>
          <p className="text-sm">
            {option.name} <span className="text-muted-foreground">· {option.where}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {stop.detail}
            {stop.cost !== null ? ` · ${formatPrice(stop.cost)}` : ""}
          </p>
          <PlanTaughtList recipes={stop.teaches} />
        </div>
      </div>
      <Link
        to={routeThereHref(ordered.to, ordered.from, faction)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-muted/40"
        data-testid="plan-stop-route"
      >
        <MapPin className="h-4 w-4" aria-hidden />
        {GOAL_PLANNER_TEXT.routeThere}
      </Link>
    </li>
  );
}
