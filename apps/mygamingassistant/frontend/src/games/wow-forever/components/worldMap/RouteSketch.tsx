import { useMemo } from "react";
import type { WorldPoint } from "@/games/wow-forever/types/worldMap";

/** A numbered line of the directions, marked where it starts. */
export interface SketchMark {
  number: number;
  at: WorldPoint;
}

interface RouteSketchProps {
  /** Walkable floor around the route (a faint backdrop). */
  ground: readonly WorldPoint[];
  path: readonly WorldPoint[];
  /** The line being hovered / focused, drawn heavier. */
  highlight: readonly WorldPoint[] | null;
  startLabel: string;
  endLabel: string;
  /** Accessible description of the drawing. */
  label: string;
  marks?: readonly SketchMark[];
}

const PAD = 20; // yd around the drawing
const GROUND_RADIUS = 7; // yd — a walk graph node covers ~12 yd
/** A route spanning less height than this is drawn in one colour. */
const LEVEL_YARDS = 8;
/** Route colour by height band, highest first: lighter is higher. */
const LEVEL_CLASS = ["stroke-sky-300", "stroke-blue-500", "stroke-indigo-800 dark:stroke-indigo-400"] as const;

/** Plan view, north up: world X is north, world Y is west. */
function sx(p: WorldPoint): number {
  return -p.wy;
}
function sy(p: WorldPoint): number {
  return -p.wx;
}

function line(points: readonly WorldPoint[]): string {
  return points.map((p) => `${sx(p).toFixed(1)},${sy(p).toFixed(1)}`).join(" ");
}

/** Where a marker's name goes: on the side facing the middle, so it stays inside the drawing. */
function labelAt(
  p: WorldPoint,
  unit: number,
  midX: number,
): { x: number; y: number; textAnchor: "start" | "end" } {
  // Above and to the side: the first numbered marker sits right on the point.
  const y = sy(p) - 2.5 * unit;
  if (sx(p) > midX) return { x: sx(p) - 2 * unit, y, textAnchor: "end" };
  return { x: sx(p) + 2 * unit, y, textAnchor: "start" };
}

interface Run {
  band: number;
  points: WorldPoint[];
}

/** The path cut where its height band changes (one run when it stays level). */
function levelRuns(path: readonly WorldPoint[]): Run[] {
  const zs = path.map((p) => p.z ?? 0);
  const lo = Math.min(...zs);
  const span = Math.max(...zs) - lo;
  if (span < LEVEL_YARDS) return [{ band: 1, points: [...path] }];
  const runs: Run[] = [];
  for (let i = 1; i < path.length; i++) {
    const mid = ((zs[i - 1] + zs[i]) / 2 - lo) / span;
    const band = Math.min(2, Math.floor((1 - mid) * 3));
    const last = runs[runs.length - 1];
    if (last && last.band === band) last.points.push(path[i]);
    else runs.push({ band, points: [path[i - 1], path[i]] });
  }
  return runs;
}

/**
 * A sketch of a route where there's no map art to draw it on — inside a
 * dungeon, a cave or a building — over the floor around it. Floors above
 * one another overlap: it's a sketch; the numbered lines are the directions.
 */
export default function RouteSketch(props: RouteSketchProps) {
  const { ground, path, highlight, startLabel, endLabel, label, marks = [] } = props;
  const box = useMemo(() => {
    const all = [...ground, ...path];
    const xs = all.map(sx);
    const ys = all.map(sy);
    const x0 = Math.min(...xs) - PAD;
    const y0 = Math.min(...ys) - PAD;
    return {
      x0,
      y0,
      w: Math.max(...xs) + PAD - x0,
      h: Math.max(...ys) + PAD - y0,
    };
  }, [ground, path]);
  const runs = useMemo(() => levelRuns(path), [path]);
  if (!path.length) return null;
  const start = path[0];
  const end = path[path.length - 1];
  const levels = runs.length > 1 || runs[0]?.band !== 1;
  // Markers and labels in screen-ish units whatever the place's size.
  const unit = Math.max(box.w, box.h) / 100;

  return (
    <figure className="w-full max-w-md space-y-1">
      <svg
        role="img"
        aria-label={label}
        viewBox={`${box.x0} ${box.y0} ${box.w} ${box.h}`}
        className="w-full rounded-md border bg-muted"
        style={{ aspectRatio: `${box.w} / ${box.h}`, maxHeight: "28rem" }}
      >
        <g aria-hidden className="text-muted-foreground" fill="currentColor" opacity={0.3}>
          {ground.map((p, i) => (
            <circle key={i} cx={sx(p)} cy={sy(p)} r={GROUND_RADIUS} />
          ))}
        </g>
        {runs.map((run, i) => (
          <polyline
            key={i}
            aria-hidden
            points={line(run.points)}
            fill="none"
            className={LEVEL_CLASS[run.band]}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {highlight && highlight.length > 1 && (
          <polyline
            aria-hidden
            points={line(highlight)}
            fill="none"
            className="stroke-amber-500 dark:stroke-amber-300"
            strokeWidth={6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <g aria-hidden fontSize={unit * 4.5} className="text-foreground" fill="currentColor">
          {marks.map((m) => (
            <g key={m.number}>
              <circle
                cx={sx(m.at)}
                cy={sy(m.at)}
                r={unit * 3.4}
                className="fill-white stroke-blue-600"
                strokeWidth={unit * 0.5}
              />
              <text
                x={sx(m.at)}
                y={sy(m.at) + unit * 1.4}
                textAnchor="middle"
                fontSize={unit * 4}
                fontWeight={700}
                className="fill-slate-900"
              >
                {m.number}
              </text>
            </g>
          ))}
          <circle
            cx={sx(start)}
            cy={sy(start)}
            r={unit * 2.2}
            className="fill-green-600 stroke-white"
            strokeWidth={unit * 0.6}
          />
          <circle
            cx={sx(end)}
            cy={sy(end)}
            r={unit * 2.2}
            className="fill-red-600 stroke-white"
            strokeWidth={unit * 0.6}
          />
          <text {...labelAt(start, unit, box.x0 + box.w / 2)}>
            {startLabel}
          </text>
          <text {...labelAt(end, unit, box.x0 + box.w / 2)}>{endLabel}</text>
          <text
            x={box.x0 + unit * 2}
            y={box.y0 + unit * 6}
            className="text-muted-foreground"
            fill="currentColor"
            fontWeight={600}
          >
            N ↑
          </text>
        </g>
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        North up.{levels && " Lighter route is higher up."} Levels stacked on
        one another overlap — the numbered lines are the directions.
      </figcaption>
    </figure>
  );
}
