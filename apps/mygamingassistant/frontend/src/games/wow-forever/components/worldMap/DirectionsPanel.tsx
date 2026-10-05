import { Anchor, Footprints, Loader2, Plane, Ship, TramFront } from "lucide-react";
import type { ReactNode } from "react";
import InsideSketch from "@/games/wow-forever/components/worldMap/InsideSketch";
import WaypointButtons from "@/games/wow-forever/components/worldMap/WaypointButtons";
import { WALK_STATUS, type WalkStatus } from "@/games/wow-forever/hooks/useWalkGraphs";
import { STEP_KIND, type Directions, type StepKind } from "@/games/wow-forever/worldMap/directions";

const STEP_ICON: Readonly<Record<StepKind, ReactNode>> = {
  walk: <Footprints className="h-4 w-4" aria-hidden />,
  fly: <Plane className="h-4 w-4" aria-hidden />,
  boat: <Ship className="h-4 w-4" aria-hidden />,
  zeppelin: <Anchor className="h-4 w-4" aria-hidden />,
  tram: <TramFront className="h-4 w-4" aria-hidden />,
};

/** The walking routes behind the steps: loading state, and which step's leg the map highlights. */
export interface DirectionsWalk {
  status: WalkStatus;
  retry: () => void;
  onHighlight: (step: number | null) => void;
}

interface DirectionsPanelProps {
  directions: Directions | null;
  walk: DirectionsWalk;
}

/** Numbered steps, each with its own waypoint buttons; a walk that follows the ground lists its sub-steps. */
export default function DirectionsPanel({ directions, walk }: DirectionsPanelProps) {
  if (!directions) {
    return (
      <p className="text-sm text-muted-foreground">
        No known route from here — this area's travel isn't in the game data yet.
      </p>
    );
  }
  if (walk.status === WALK_STATUS.loading) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Finding the walking route…
      </p>
    );
  }
  const usesTransport = directions.steps.some(
    (s) => s.kind === STEP_KIND.boat || s.kind === STEP_KIND.zeppelin || s.kind === STEP_KIND.tram,
  );
  return (
    <div className="space-y-3">
      {walk.status === WALK_STATUS.error && (
        <p role="alert" className="text-sm">
          Couldn't load the walking routes, so walks are straight lines.{" "}
          <button type="button" onClick={walk.retry} className="font-medium text-primary underline underline-offset-2">
            Retry
          </button>
        </p>
      )}
      <ol className="space-y-3" aria-label="Directions" onMouseLeave={() => walk.onHighlight(null)}>
        {directions.steps.map((step, i) => (
          <li
            key={`${i}-${step.text}`}
            className="flex gap-3"
            onMouseEnter={() => walk.onHighlight(i + 1)}
            onFocus={() => walk.onHighlight(i + 1)}
            onBlur={() => walk.onHighlight(null)}
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-muted-foreground">{STEP_ICON[step.kind]}</span>
                <span>{step.text}</span>
              </p>
              {step.inside?.map((run) => (
                <InsideSketch key={run.firstStep} run={run} destination={step.place.label} />
              ))}
              {step.detail && step.detail.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Step by step ({step.detail.length})
                  </summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {step.detail.map((line, j) => (
                      <li key={`${j}-${line}`}>{line}</li>
                    ))}
                  </ol>
                </details>
              )}
              <WaypointButtons
                target={{ zoneId: step.place.zoneId, zoneName: step.place.zoneName, x: step.place.x, y: step.place.y, label: step.place.label }}
              />
            </div>
          </li>
        ))}
      </ol>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        {directions.straightWalks ? (
          <li>Some walks are straight lines — go around hills, water and hostile camps.</li>
        ) : (
          <li>Walks follow the ground from the game's own map data and keep clear of the other faction's towns — monsters on the way are still yours to watch.</li>
        )}
        {directions.usesFlight && (
          <li>Flight paths must be discovered first: talk to each flight master once on foot before you can fly there.</li>
        )}
        {usesTransport && <li>Boats, zeppelins and the tram run on a loop — wait at the stop if one just left.</li>}
      </ul>
    </div>
  );
}
