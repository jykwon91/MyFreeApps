import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, Lock } from "lucide-react";
import InteriorSchematic from "@/games/wow-forever/components/worldMap/InteriorSchematic";
import type { WorldPoint } from "@/games/wow-forever/types/worldMap";
import { formatYards } from "@/games/wow-forever/worldMap/geometry";
import {
  BOSS_ROUTE,
  type BossRoute,
} from "@/games/wow-forever/worldMap/interiors";

interface InteriorBossRouteProps {
  route: BossRoute;
  /** Kill-order number shown before the name (null for bosses with no route). */
  number: number | null;
  open: boolean;
  onToggle: () => void;
  ground: readonly WorldPoint[];
  panelId: string;
}

function summary(route: BossRoute): string {
  if (route.status === BOSS_ROUTE.unplaced) return "No fixed spot";
  if (route.status === BOSS_ROUTE.unreachable) return "No walking route found";
  if (route.steps.length === 0) return "Right there";
  return formatYards(route.yards);
}

function startName(route: BossRoute): string {
  return route.fromBoss ? route.fromBoss.name : "Entrance";
}

/** One boss in the "Inside" list: its header, and when open the sketch and the walk there step by step. */
export default function InteriorBossRoute(props: InteriorBossRouteProps) {
  const { route, number, open, onToggle, ground, panelId } = props;
  const [highlight, setHighlight] = useState<number | null>(null);
  const { boss } = route;
  const keys = [
    ...new Set(route.steps.flatMap((s) => (s.door ? [s.door] : []))),
  ];

  return (
    <li className="rounded-md border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm min-h-[44px] hover:bg-muted/40"
      >
        <span className="min-w-0 flex-1">
          <span className="font-medium">
            {number !== null && `${number}. `}
            {boss.name}
          </span>
          <span className="text-muted-foreground"> · {summary(route)}</span>
        </span>
        {keys.length > 0 && (
          <Lock
            className="h-4 w-4 shrink-0 text-amber-600"
            aria-label="Locked door on the way"
          />
        )}
        <ChevronDown
          className={clsx(
            "h-4 w-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 border-t px-3 py-3 text-sm">
          {route.status === BOSS_ROUTE.unplaced && (
            <p className="text-muted-foreground">
              {boss.name} has no fixed spot — it's summoned or comes out during
              an event, so there's no walk to show.
            </p>
          )}
          {route.status === BOSS_ROUTE.unreachable && (
            <p className="text-muted-foreground">
              No walkable route found to {boss.name} — the game's map data has a
              gap (a jump, a door or a lift we can't follow).
            </p>
          )}
          {route.status === BOSS_ROUTE.route && (
            <>
              <p>
                From the{" "}
                {route.fromBoss ? `${route.fromBoss.name} fight` : "entrance"}{" "}
                to {boss.name}
                {route.yards > 0 && `, ${formatYards(route.yards)} on foot`}
                {boss.spots > 1 &&
                  ` — it can spawn in ${boss.spots} places; this is one of them`}
                .
              </p>
              <InteriorSchematic
                ground={ground}
                path={route.path}
                highlight={
                  highlight === null ? null : route.steps[highlight].points
                }
                startLabel={startName(route)}
                bossName={boss.name}
                label={`Sketch of the route from ${startName(route)} to ${boss.name}, ${route.steps.length} steps, about ${Math.round(route.yards)} yards`}
              />
              {route.steps.length > 0 && (
                <ol
                  className="list-decimal space-y-1 pl-5"
                  onMouseLeave={() => setHighlight(null)}
                >
                  {route.steps.map((step, i) => (
                    <li
                      key={`${i}-${step.text}`}
                      tabIndex={0}
                      onMouseEnter={() => setHighlight(i)}
                      onFocus={() => setHighlight(i)}
                      onBlur={() => setHighlight(null)}
                      className={clsx(
                        "rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500",
                        highlight === i && "bg-muted",
                      )}
                    >
                      {step.text}
                      {step.door && (
                        <span className="mt-0.5 flex items-center gap-1 text-amber-700 dark:text-amber-400">
                          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Locked door — needs {step.door}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
