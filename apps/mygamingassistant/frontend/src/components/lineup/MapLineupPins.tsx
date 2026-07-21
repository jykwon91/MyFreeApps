/**
 * MapLineupPins — SVG overlay of clickable per-lineup pins on the minimap.
 *
 * Renders in the same 1000x1000 viewBox as MapZoneOverlay so pin coordinates
 * (normalized 0-1 from the backend's effective_* fields) align with the map
 * image and zone polygons.
 *
 * Behavior:
 *   - mode "stand" renders one pin per lineup at effective_stand_x/y
 *   - mode "target" renders one pin per lineup at effective_target_x/y
 *   - mode "both" renders two pins per lineup (stand=blue, target=orange)
 *
 * Stacked pins (within CLUSTER_THRESHOLD in viewBox units) collapse into a
 * single numbered badge; clicking the badge opens a popover that lists the
 * collapsed lineups so the user can disambiguate. This is unavoidable for
 * seed data where multiple lineups fall on the same zone centroid.
 */
import { useMemo, useState } from "react";
import type { Lineup } from "@/types/game";

export type PinMode = "stand" | "target" | "both";

interface Props {
  lineups: Lineup[];
  mode: PinMode;
  selectedLineupId: string | null;
  onPinSelect: (lineupId: string) => void;
  /** Lineup currently hovered in the list — its pin(s) get a steady halo +
   *  enlargement so the operator can see where a row lands on the map without
   *  clicking. Distinct from ``selectedLineupId`` (the click-select ping):
   *  hover is a transient pointer cue, selection is a committed choice, and
   *  both can be active at once. Null when nothing is hovered. */
  highlightedLineupId?: string | null;
  /** viewBox dimensions — defaults to 1000 (matches MapZoneOverlay). */
  viewBoxSize?: number;
}

/** Distance (in viewBox units) below which two pins collapse into a cluster. */
const CLUSTER_THRESHOLD = 30;

const STAND_FILL = "#3b82f6"; // blue-500
const TARGET_FILL = "#f97316"; // orange-500
const MIXED_FILL = "#71717a"; // zinc-500 when a cluster spans both modes

// Hover-highlight accent. Deliberately NOT the pin's own fill (a same-color
// halo blends into the dot and is invisible) — a bright high-contrast yellow
// reads against blue pins, orange pins, and the map underneath alike.
const HIGHLIGHT_ACCENT = "#fde047"; // yellow-300
// Opacity every non-hovered pin drops to while a row is hovered, so the
// matching pin pops out of the crowd instead of being one dot among many.
const DIMMED_OPACITY = 0.2;

type PinKind = "stand" | "target";

interface Pin {
  /** Composite key — lineup id + kind so each pin is uniquely addressable. */
  key: string;
  lineupId: string;
  kind: PinKind;
  x: number; // viewBox units
  y: number;
  title: string;
  /** True when this pin sits on the zone centroid (no explicit anchor set) —
   *  rendered with a dashed ring so the operator can spot unplaced lineups. */
  isGuess: boolean;
}

interface Cluster {
  /** Average position — where the cluster badge / single pin renders. */
  cx: number;
  cy: number;
  pins: Pin[];
}

/** True when this lineup has no place on the map for the given mode. */
function isUnplaceable(l: Lineup, mode: PinMode): boolean {
  const standMissing = l.effective_stand_x == null || l.effective_stand_y == null;
  const targetMissing = l.effective_target_x == null || l.effective_target_y == null;
  if (mode === "stand") return standMissing;
  if (mode === "target") return targetMissing;
  // "both" — placeable if EITHER endpoint resolves.
  return standMissing && targetMissing;
}

/**
 * Count lineups that exist but can't be shown on the map because neither
 * their stand nor target endpoint resolved (no explicit anchor AND the
 * referenced zone has no polygon to take a centroid from). Used by MapPage
 * to surface a non-blocking calibration hint.
 */
export function countUnplaceableLineups(lineups: Lineup[], mode: PinMode): number {
  return lineups.reduce((acc, l) => acc + (isUnplaceable(l, mode) ? 1 : 0), 0);
}

function buildPins(
  lineups: Lineup[],
  mode: PinMode,
  viewBoxSize: number,
): Pin[] {
  const out: Pin[] = [];
  for (const l of lineups) {
    if (mode === "stand" || mode === "both") {
      if (l.effective_stand_x != null && l.effective_stand_y != null) {
        out.push({
          key: `${l.id}:stand`,
          lineupId: l.id,
          kind: "stand",
          x: l.effective_stand_x * viewBoxSize,
          y: l.effective_stand_y * viewBoxSize,
          title: l.title,
          isGuess: l.stand_anchor_x == null,
        });
      }
    }
    if (mode === "target" || mode === "both") {
      if (l.effective_target_x != null && l.effective_target_y != null) {
        out.push({
          key: `${l.id}:target`,
          lineupId: l.id,
          kind: "target",
          x: l.effective_target_x * viewBoxSize,
          y: l.effective_target_y * viewBoxSize,
          title: l.title,
          isGuess: l.target_anchor_x == null,
        });
      }
    }
  }
  return out;
}

function buildClusters(pins: Pin[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const pin of pins) {
    const c = clusters.find((cl) => {
      const dx = cl.cx - pin.x;
      const dy = cl.cy - pin.y;
      return Math.hypot(dx, dy) < CLUSTER_THRESHOLD;
    });
    if (c) {
      c.pins.push(pin);
      c.cx = (c.cx * (c.pins.length - 1) + pin.x) / c.pins.length;
      c.cy = (c.cy * (c.pins.length - 1) + pin.y) / c.pins.length;
    } else {
      clusters.push({ cx: pin.x, cy: pin.y, pins: [pin] });
    }
  }
  return clusters;
}

function pinFill(kind: PinKind): string {
  return kind === "stand" ? STAND_FILL : TARGET_FILL;
}

function clusterFill(pins: Pin[]): string {
  if (pins.every((p) => p.kind === "stand")) return STAND_FILL;
  if (pins.every((p) => p.kind === "target")) return TARGET_FILL;
  return MIXED_FILL;
}

export default function MapLineupPins({
  lineups,
  mode,
  selectedLineupId,
  onPinSelect,
  highlightedLineupId = null,
  viewBoxSize = 1000,
}: Props) {
  const pins = useMemo(() => buildPins(lineups, mode, viewBoxSize), [lineups, mode, viewBoxSize]);
  const clusters = useMemo(() => buildClusters(pins), [pins]);
  const [openClusterIndex, setOpenClusterIndex] = useState<number | null>(null);

  // When any row is hovered, every non-matching pin dims so the highlighted
  // one stands out. Cheap "spotlight" effect that reads far better than a
  // per-pin halo alone.
  const anyHighlighted = highlightedLineupId != null;

  if (pins.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="absolute inset-0 w-full h-full"
        style={{ overflow: "visible" }}
      >
        {clusters.map((cluster, i) => {
          // --- Single-pin path ---------------------------------------------
          if (cluster.pins.length === 1) {
            const p = cluster.pins[0];
            const isSelected = p.lineupId === selectedLineupId;
            const isHighlighted = p.lineupId === highlightedLineupId;
            const fill = pinFill(p.kind);
            return (
              <g
                key={p.key}
                tabIndex={0}
                role="button"
                aria-label={`Open lineup: ${p.title}`}
                className="pointer-events-auto cursor-pointer focus:outline-none transition-opacity duration-150"
                style={{ opacity: anyHighlighted && !isHighlighted ? DIMMED_OPACITY : 1 }}
                onClick={() => onPinSelect(p.lineupId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPinSelect(p.lineupId);
                  }
                }}
              >
                <circle cx={p.x} cy={p.y} r={22} fill="transparent" />
                {p.isGuess && !isHighlighted && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={16}
                    fill="none"
                    stroke={fill}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    opacity={0.5}
                  />
                )}
                {/* Hover highlight — a bright yellow glow + ring in a color
                    the pin ISN'T, so it can't blend in. Pulses (opacity only,
                    no expansion) to catch the eye and stay distinct from the
                    click-select ping below (which expands + fades). */}
                {isHighlighted && (
                  <>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={26}
                      fill={HIGHLIGHT_ACCENT}
                      className="opacity-30 animate-pulse"
                    />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={20}
                      fill="none"
                      stroke={HIGHLIGHT_ACCENT}
                      strokeWidth={5}
                    />
                  </>
                )}
                {isSelected && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={16}
                    fill="none"
                    stroke={fill}
                    strokeWidth={2.5}
                    className="opacity-70 animate-ping"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHighlighted ? 16 : isSelected ? 12 : 10}
                  fill={fill}
                  stroke={isHighlighted ? HIGHLIGHT_ACCENT : "white"}
                  strokeWidth={isHighlighted ? 4 : 2}
                  className="transition-all duration-150"
                />
              </g>
            );
          }

          // --- Cluster path ------------------------------------------------
          const count = cluster.pins.length;
          const fill = clusterFill(cluster.pins);
          const containsSelected =
            selectedLineupId != null &&
            cluster.pins.some((p) => p.lineupId === selectedLineupId);
          const containsHighlighted =
            highlightedLineupId != null &&
            cluster.pins.some((p) => p.lineupId === highlightedLineupId);
          const isOpen = openClusterIndex === i;

          return (
            <g
              key={`cluster-${i}`}
              className="pointer-events-auto transition-opacity duration-150"
              style={{ opacity: anyHighlighted && !containsHighlighted ? DIMMED_OPACITY : 1 }}
            >
              <g
                tabIndex={0}
                role="button"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-label={`${count} stacked lineups — click to expand`}
                className="cursor-pointer focus:outline-none"
                onClick={() => setOpenClusterIndex(isOpen ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenClusterIndex(isOpen ? null : i);
                  }
                }}
              >
                <circle cx={cluster.cx} cy={cluster.cy} r={22} fill="transparent" />
                {/* Hover highlight when a hovered row's pin lives inside this
                    cluster — bright yellow glow + ring, same language as the
                    single pin so a stacked target is just as easy to spot. */}
                {containsHighlighted && (
                  <>
                    <circle
                      cx={cluster.cx}
                      cy={cluster.cy}
                      r={28}
                      fill={HIGHLIGHT_ACCENT}
                      className="opacity-30 animate-pulse"
                    />
                    <circle
                      cx={cluster.cx}
                      cy={cluster.cy}
                      r={22}
                      fill="none"
                      stroke={HIGHLIGHT_ACCENT}
                      strokeWidth={5}
                    />
                  </>
                )}
                {containsSelected && (
                  <circle
                    cx={cluster.cx}
                    cy={cluster.cy}
                    r={18}
                    fill="none"
                    stroke={fill}
                    strokeWidth={2.5}
                    className="opacity-70 animate-ping"
                  />
                )}
                <circle
                  cx={cluster.cx}
                  cy={cluster.cy}
                  r={containsHighlighted ? 17 : 14}
                  fill={fill}
                  stroke={containsHighlighted ? HIGHLIGHT_ACCENT : "white"}
                  strokeWidth={containsHighlighted ? 4 : 2}
                />
                <text
                  x={cluster.cx}
                  y={cluster.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={13}
                  fontWeight={700}
                  fill="white"
                  style={{ userSelect: "none" }}
                >
                  {count}
                </text>
              </g>

              {isOpen && (
                <foreignObject
                  x={cluster.cx + 18}
                  y={cluster.cy - 18}
                  width={220}
                  height={Math.min(40 + count * 36, 320)}
                  style={{ overflow: "visible" }}
                >
                  <div
                    className="bg-popover border rounded-md shadow-lg p-1 text-xs"
                    role="menu"
                  >
                    <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {count} lineups at this spot
                    </p>
                    <ul className="space-y-0.5 max-h-72 overflow-y-auto">
                      {cluster.pins.map((p) => (
                        <li key={p.key}>
                          <button
                            type="button"
                            onClick={() => {
                              onPinSelect(p.lineupId);
                              setOpenClusterIndex(null);
                            }}
                            className={[
                              "w-full text-left px-2 py-1.5 rounded hover:bg-muted/60 transition-colors flex items-center gap-2",
                              p.lineupId === selectedLineupId ? "bg-muted/40 font-medium" : "",
                            ].join(" ")}
                            role="menuitem"
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: pinFill(p.kind) }}
                              aria-hidden
                            />
                            <span className="truncate">{p.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
