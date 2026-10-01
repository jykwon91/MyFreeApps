import { useMemo, useState } from "react";
import clsx from "clsx";
import { Skeleton } from "@platform/ui";
import { ChevronDown, Loader2 } from "lucide-react";
import InteriorBossRoute from "@/games/wow-forever/components/worldMap/InteriorBossRoute";
import {
  useInteriorWalk,
  useRouteFrom,
} from "@/games/wow-forever/hooks/useInteriors";
import { WALK_STATUS } from "@/games/wow-forever/hooks/useWalkGraphs";
import {
  BOSS_ROUTE,
  interiorRoutes,
  reachableGround,
  ROUTE_FROM,
  type Interior,
  type RouteFrom,
} from "@/games/wow-forever/worldMap/interiors";

interface InstanceInteriorProps {
  interior: Interior;
  /** The entrance this row is (its area trigger id). */
  trigger: number;
  name: string;
  /** Unique per row, for element ids. */
  rowId: string;
}

const FROM_OPTIONS: readonly { value: RouteFrom; label: string }[] = [
  { value: ROUTE_FROM.previous, label: "From the boss before" },
  { value: ROUTE_FROM.entrance, label: "From the entrance" },
];

/**
 * "Inside" for a dungeon / raid entrance row: its bosses in kill order, each
 * opening to a sketch and the walk there step by step. The walk graph loads
 * on first open; boss names show straight away.
 */
export default function InstanceInterior({
  interior,
  trigger,
  name,
  rowId,
}: InstanceInteriorProps) {
  const [open, setOpen] = useState(false);
  const [openBoss, setOpenBoss] = useState<number | null>(null);
  const [from, setFrom] = useRouteFrom();
  const walk = useInteriorWalk(interior.mapId, open);
  const { graph } = walk;
  const routes = useMemo(
    () => (graph ? interiorRoutes(graph, interior, trigger, from) : null),
    [graph, interior, trigger, from],
  );
  const ground = useMemo(
    () => (graph ? reachableGround(graph, trigger) : []),
    [graph, trigger],
  );
  const sectionId = `${rowId}-inside`;
  const loading = walk.status === WALK_STATUS.loading;
  let numbered = 0;

  return (
    // Clicks in here are the section's own — never the row's "show on map".
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={sectionId}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] transition-colors",
          open ? "bg-muted" : "hover:bg-muted/40",
        )}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Inside · bosses &amp; routes
        <ChevronDown
          className={clsx("h-4 w-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <section
          id={sectionId}
          aria-label={`Inside ${name}`}
          className="space-y-3 border-t pt-3"
        >
          <div
            role="radiogroup"
            aria-label="Walk to each boss"
            className="inline-flex flex-wrap rounded-md border p-0.5 text-sm"
          >
            {FROM_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={from === o.value}
                onClick={() => setFrom(o.value)}
                className={clsx(
                  "rounded px-3 min-h-[44px] sm:min-h-[32px]",
                  from === o.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/40",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {walk.status === WALK_STATUS.error && (
            <p role="alert" className="text-sm">
              Couldn't load the routes inside {name}.{" "}
              <button
                type="button"
                onClick={walk.retry}
                className="font-medium text-primary underline underline-offset-2"
              >
                Retry
              </button>
            </p>
          )}
          {!routes && (
            <ol className="space-y-2" aria-busy={loading}>
              {interior.bosses.slice(0, 6).map((b) => (
                <li
                  key={b.encounter}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{b.name}</span>
                  <Skeleton className="h-3 w-16" />
                </li>
              ))}
            </ol>
          )}
          {routes && (
            <ol className="space-y-2" aria-label={`Bosses in ${name}`}>
              {routes.map((route) => {
                const number =
                  route.status === BOSS_ROUTE.unplaced ? null : ++numbered;
                return (
                  <InteriorBossRoute
                    key={route.boss.encounter}
                    route={route}
                    number={number}
                    open={openBoss === route.boss.encounter}
                    onToggle={() =>
                      setOpenBoss((cur) =>
                        cur === route.boss.encounter
                          ? null
                          : route.boss.encounter,
                      )
                    }
                    ground={ground}
                    panelId={`${sectionId}-${route.boss.encounter}`}
                  />
                );
              })}
            </ol>
          )}
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Boss order and positions are Classic's — Forever may differ.
            </li>
            <li>
              Routes come from the game's own map data and don't count fights.
              Doors, gates and events can block the way.
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
