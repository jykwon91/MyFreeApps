import { Anchor, Footprints, Plane, Ship } from "lucide-react";
import type { ReactNode } from "react";
import WaypointButtons from "@/games/wow-forever/components/worldMap/WaypointButtons";
import { STEP_KIND, type Directions, type StepKind } from "@/games/wow-forever/worldMap/directions";

const STEP_ICON: Readonly<Record<StepKind, ReactNode>> = {
  walk: <Footprints className="h-4 w-4" aria-hidden />,
  fly: <Plane className="h-4 w-4" aria-hidden />,
  boat: <Ship className="h-4 w-4" aria-hidden />,
  zeppelin: <Anchor className="h-4 w-4" aria-hidden />,
};

interface DirectionsPanelProps {
  directions: Directions | null;
}

/** Numbered steps, each with its own waypoint buttons. */
export default function DirectionsPanel({ directions }: DirectionsPanelProps) {
  if (!directions) {
    return (
      <p className="text-sm text-muted-foreground">
        No known route from here — this area's travel isn't in the game data yet.
      </p>
    );
  }
  const usesTransport = directions.steps.some((s) => s.kind === STEP_KIND.boat || s.kind === STEP_KIND.zeppelin);
  return (
    <div className="space-y-3">
      <ol className="space-y-3" aria-label="Directions">
        {directions.steps.map((step, i) => (
          <li key={`${i}-${step.text}`} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-muted-foreground">{STEP_ICON[step.kind]}</span>
                <span>{step.text}</span>
              </p>
              <WaypointButtons
                target={{ zoneId: step.place.zoneId, zoneName: step.place.zoneName, x: step.place.x, y: step.place.y, label: step.place.label }}
              />
            </div>
          </li>
        ))}
      </ol>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Walking directions are straight lines — go around hills, water and hostile camps.</li>
        {directions.usesFlight && (
          <li>Flight paths must be discovered first: talk to each flight master once on foot before you can fly there.</li>
        )}
        {usesTransport && <li>Boats and zeppelins run on a loop — wait at the dock if one just left.</li>}
      </ul>
    </div>
  );
}
