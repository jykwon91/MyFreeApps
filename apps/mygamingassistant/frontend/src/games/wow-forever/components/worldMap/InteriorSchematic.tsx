import { useMemo } from "react";
import type { WorldPoint } from "@/games/wow-forever/types/worldMap";

interface InteriorSchematicProps {
  /** Walkable ground the entrance reaches (a faint backdrop). */
  ground: readonly WorldPoint[];
  path: readonly WorldPoint[];
  /** The step being hovered / focused, drawn heavier. */
  highlight: readonly WorldPoint[] | null;
  startLabel: string;
  bossName: string;
  label: string;
}

const PAD = 20; // yd around the drawing
const GROUND_RADIUS = 7; // yd — a walk graph node covers ~12 yd

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
  if (sx(p) > midX)
    return { x: sx(p) - 3 * unit, y: sy(p) + 1.5 * unit, textAnchor: "end" };
  return { x: sx(p) + 3 * unit, y: sy(p) + 1.5 * unit, textAnchor: "start" };
}

/**
 * A sketch of a boss route — there's no in-game map art for dungeons — over
 * the dungeon's walkable floor. Floors above one another overlap: it's a
 * sketch; the numbered steps are the directions.
 */
export default function InteriorSchematic(props: InteriorSchematicProps) {
  const { ground, path, highlight, startLabel, bossName, label } = props;
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
  if (!path.length) return null;
  const start = path[0];
  const end = path[path.length - 1];
  // Markers and labels in screen-ish units whatever the dungeon's size.
  const unit = Math.max(box.w, box.h) / 100;

  return (
    <figure className="w-full max-w-sm space-y-1">
      <svg
        role="img"
        aria-label={label}
        viewBox={`${box.x0} ${box.y0} ${box.w} ${box.h}`}
        className="w-full rounded-md border bg-muted"
        style={{ aspectRatio: `${box.w} / ${box.h}`, maxHeight: "22rem" }}
      >
        <g aria-hidden className="text-muted-foreground" fill="currentColor" opacity={0.3}>
          {ground.map((p, i) => (
            <circle key={i} cx={sx(p)} cy={sy(p)} r={GROUND_RADIUS} />
          ))}
        </g>
        <polyline
          aria-hidden
          points={line(path)}
          fill="none"
          className="stroke-blue-500"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {highlight && highlight.length > 1 && (
          <polyline
            aria-hidden
            points={line(highlight)}
            fill="none"
            className="stroke-blue-700 dark:stroke-blue-300"
            strokeWidth={6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <g aria-hidden fontSize={unit * 4.5} className="text-foreground" fill="currentColor">
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
          <text {...labelAt(end, unit, box.x0 + box.w / 2)}>{bossName}</text>
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
        Sketch, north up — floors above one another overlap.
      </figcaption>
    </figure>
  );
}
