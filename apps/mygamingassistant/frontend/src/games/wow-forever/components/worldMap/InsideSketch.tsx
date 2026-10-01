import { useState } from "react";
import clsx from "clsx";
import RouteSketch from "@/games/wow-forever/components/worldMap/RouteSketch";
import { formatYards } from "@/games/wow-forever/worldMap/geometry";
import type { InsideRun } from "@/games/wow-forever/worldMap/insideRuns";

interface InsideSketchProps {
  run: InsideRun;
  /** Where the walk ends — the sketch's end marker when the walk ends in here. */
  destination: string;
}

/** Height change worth saying in the heading. */
const CLIMB_YARDS = 8;

function climbText(climb: number): string {
  if (Math.abs(climb) < CLIMB_YARDS) return "";
  return climb > 0 ? `, climbing ${formatYards(climb)}` : `, going down ${formatYards(-climb)}`;
}

/**
 * The part of a walk inside a cave or building: a sketch of the way through
 * (the zone map only shows the surface) and its numbered lines, numbered as
 * in the walk's full step-by-step list. Hover, focus or tap a line to pick
 * it out on the sketch.
 */
export default function InsideSketch({ run, destination }: InsideSketchProps) {
  const [highlight, setHighlight] = useState<number | null>(null);
  const where = run.name || "inside";
  const title = run.name ? `Inside ${run.name}` : "Inside";
  const startLabel = run.startsInside ? "You" : "Way in";
  const endLabel = run.endsInside ? destination : "Way out";
  const first = run.firstStep + 1;

  return (
    <details open className="space-y-2 text-sm">
      <summary className="cursor-pointer font-medium">
        {title} · {formatYards(run.yards)}
        {climbText(run.climb)}
      </summary>
      <div className="mt-2 space-y-2">
        <RouteSketch
          ground={run.ground}
          path={run.path}
          highlight={highlight === null ? null : run.steps[highlight].points}
          startLabel={startLabel}
          endLabel={endLabel}
          marks={run.steps.map((s, i) => ({ number: first + i, at: s.points[0] }))}
          label={`Sketch of the way through ${where}: ${run.steps.length} steps, about ${Math.round(run.yards)} yards`}
        />
        <ol start={first} className="list-decimal space-y-1 pl-5" onMouseLeave={() => setHighlight(null)}>
          {run.steps.map((step, i) => (
            <li key={`${i}-${step.text}`}>
              <button
                type="button"
                aria-pressed={highlight === i}
                onMouseEnter={() => setHighlight(i)}
                onFocus={() => setHighlight(i)}
                onBlur={() => setHighlight(null)}
                onClick={() => setHighlight(i)}
                className={clsx(
                  "min-h-[44px] w-full rounded px-1 text-left sm:min-h-0",
                  highlight === i && "bg-muted",
                )}
              >
                {step.text}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
