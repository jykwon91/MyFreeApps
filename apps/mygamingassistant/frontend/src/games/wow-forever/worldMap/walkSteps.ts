/**
 * A walking leg over the walk graph, told the way you'd tell a friend:
 * "Go into The Great Forge and head east, ~60 yd", "Ride the lift up",
 * "Swim north, ~120 yd". The path is split into stretches by the area it
 * crosses (room / sub-area), swimming vs walking, and lifts / portals.
 *
 * Indoors, in capital cities and inside dungeons, where one "head west,
 * ~300 yd" would walk you into a wall, a stretch goes turn by turn: "Turn
 * left and head south, ~80 yd".
 */
import type { WorldPoint } from "@/games/wow-forever/types/worldMap";
import { compassDirection, formatYards } from "@/games/wow-forever/worldMap/geometry";
import {
  isJump,
  nodePoint,
  searchFrom,
  walkPath,
  WALK_EDGE,
  type WalkGraph,
  type WalkHop,
} from "@/games/wow-forever/worldMap/walkGraph";
import { insideRuns, type InsideRun } from "@/games/wow-forever/worldMap/insideRuns";

/** A stretch shorter than this is folded into the one before it — "head north, ~10 yd" is noise. */
const MIN_STRETCH_YARDS = 25;
/** A short detour into another area between two stretches of the same one (A, B, A) is just A. */
const SANDWICH_YARDS = 100;
/** Height change worth mentioning on a stretch. */
const CLIMB_YARDS = 8;
/** How far the path may wander off a straight line before it counts as a bend. */
const BEND_TOLERANCE_YARDS = 15;
/** A change of heading worth a "turn". */
const TURN_DEGREES = 45;
/** ... and a sharp one. */
const SHARP_TURN_DEGREES = 120;
/** A leg between two turns shorter than this is folded into the one before. */
const MIN_TURN_LEG_YARDS = 30;
/** A portal whose ends are this close is a teleport pad inside one place. */
const TELEPORTER_YARDS = 150;

export interface WalkLeg {
  /** Ground yards (run-speed yards, swimming counted slower). */
  cost: number;
  /** Yards actually covered. */
  yards: number;
  /** The path on the map, start to end. */
  path: WorldPoint[];
  /** Sub-steps; empty when the leg is one stretch (the step's own text says it all). */
  detail: string[];
  /** Stretches inside a cave or building, each drawn as its own sketch. */
  inside: InsideRun[];
}

type StretchKind = "walk" | "swim" | "lift" | "portal" | "drop" | "teleport";

/** A straight piece of a walk. */
interface Piece {
  from: WorldPoint;
  to: WorldPoint;
  yards: number;
  /** Every graph point along it, `from` to `to`. */
  points: WorldPoint[];
}

interface Stretch extends Piece {
  kind: StretchKind;
  label: number;
}

/** One line of a walk's directions and the stretch of path it covers. */
export interface WalkStep {
  text: string;
  points: WorldPoint[];
  /** The area (graph label) the line walks through. */
  label: number;
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.wx - b.wx, a.wy - b.wy, (a.z ?? 0) - (b.z ?? 0));
}

function hopKind(graph: WalkGraph, hop: WalkHop): StretchKind {
  if (hop.kind === WALK_EDGE.lift) return "lift";
  if (hop.kind === WALK_EDGE.portal) return "portal";
  if (hop.kind === WALK_EDGE.drop) return "drop";
  if (hop.kind === WALK_EDGE.teleport) return "teleport";
  return graph.water[hop.node] ? "swim" : "walk";
}

function sameArea(graph: WalkGraph, a: number, b: number): boolean {
  const la = graph.labels[a];
  const lb = graph.labels[b];
  return la.name === lb.name && la.zone === lb.zone && la.indoor === lb.indoor;
}

function isMove(s: Stretch): boolean {
  return s.kind === "walk" || s.kind === "swim";
}

/** `s` carried on to the end of `next`. */
function extend(s: Piece, next: Piece): void {
  s.to = next.to;
  s.yards += next.yards;
  s.points = [...s.points, ...next.points.slice(1)];
}

/** Consecutive walks (or swims) through the same area become one stretch. */
function joined(graph: WalkGraph, list: readonly Stretch[]): Stretch[] {
  const out: Stretch[] = [];
  for (const s of list) {
    const last = out[out.length - 1];
    if (last && isMove(s) && last.kind === s.kind && sameArea(graph, last.label, s.label)) extend(last, s);
    else out.push({ ...s });
  }
  return out;
}

/** A, short B, A → one A (never a building you walk through — that's a "go inside"). */
function unsandwiched(graph: WalkGraph, list: readonly Stretch[]): Stretch[] {
  const out: Stretch[] = [];
  for (const s of list) {
    out.push({ ...s });
    const [a, b, c] = out.slice(-3);
    if (
      out.length >= 3 &&
      [a, b, c].every(isMove) &&
      a.kind === b.kind &&
      b.kind === c.kind &&
      b.yards < SANDWICH_YARDS &&
      sameArea(graph, a.label, c.label) &&
      graph.labels[b.label].indoor === graph.labels[a.label].indoor
    ) {
      out.length -= 2;
      extend(a, b);
      extend(a, c);
    }
  }
  return out;
}

function stretches(graph: WalkGraph, hops: readonly WalkHop[]): Stretch[] {
  const raw: Stretch[] = [];
  for (let i = 1; i < hops.length; i++) {
    const from = nodePoint(graph, hops[i - 1].node);
    const to = nodePoint(graph, hops[i].node);
    const kind = hopKind(graph, hops[i]);
    raw.push({ kind, label: graph.label[hops[i].node], from, to, yards: distance(from, to), points: [from, to] });
  }
  // Fold short walks / swims into a neighbour so the list reads like directions, not a trace.
  const folded: Stretch[] = [];
  for (const s of unsandwiched(graph, joined(graph, raw))) {
    const last = folded[folded.length - 1];
    if (last && isMove(last) && isMove(s) && s.yards < MIN_STRETCH_YARDS) {
      extend(last, s);
    } else if (last && isMove(last) && isMove(s) && folded.length === 1 && last.yards < MIN_STRETCH_YARDS) {
      folded[0] = { ...s, from: last.from, yards: last.yards + s.yards, points: [...last.points, ...s.points.slice(1)] };
    } else {
      folded.push(s);
    }
  }
  return joined(graph, folded);
}

/** Indices of the points a path bends at (first and last included): Douglas–Peucker in plan view. */
function bends(points: readonly WorldPoint[]): number[] {
  const keep = new Set([0, points.length - 1]);
  const split = (lo: number, hi: number) => {
    const a = points[lo];
    const b = points[hi];
    const len = Math.hypot(b.wx - a.wx, b.wy - a.wy);
    let far = -1;
    let farthest = BEND_TOLERANCE_YARDS;
    for (let i = lo + 1; i < hi; i++) {
      const p = points[i];
      const off =
        len > 0
          ? Math.abs((b.wx - a.wx) * (a.wy - p.wy) - (a.wx - p.wx) * (b.wy - a.wy)) / len
          : Math.hypot(p.wx - a.wx, p.wy - a.wy);
      if (off > farthest) {
        far = i;
        farthest = off;
      }
    }
    if (far < 0) return;
    keep.add(far);
    split(lo, far);
    split(far, hi);
  };
  split(0, points.length - 1);
  return [...keep].sort((x, y) => x - y);
}

/** Clockwise degrees from north. */
function bearing(p: Piece): number {
  return (Math.atan2(p.from.wy - p.to.wy, p.to.wx - p.from.wx) * 180) / Math.PI;
}

/** Signed change of heading from `a` to `b`, -180..180 (positive = right). */
function turn(a: Piece, b: Piece): number {
  return ((bearing(b) - bearing(a) + 540) % 360) - 180;
}

/** A stretch's straight legs between turns (one piece when it has no turn worth telling). */
function pieces(s: Stretch): Piece[] {
  const at = bends(s.points);
  const out: Piece[] = [];
  for (let k = 1; k < at.length; k++) {
    let yards = 0;
    for (let i = at[k - 1] + 1; i <= at[k]; i++) yards += distance(s.points[i - 1], s.points[i]);
    const piece = { from: s.points[at[k - 1]], to: s.points[at[k]], yards, points: s.points.slice(at[k - 1], at[k] + 1) };
    const last = out[out.length - 1];
    if (last && (piece.yards < MIN_TURN_LEG_YARDS || Math.abs(turn(last, piece)) < TURN_DEGREES)) {
      extend(last, piece);
    } else {
      out.push(piece);
    }
  }
  // A short first leg is a step off the start, not a turn.
  if (out.length > 1 && out[0].yards < MIN_TURN_LEG_YARDS) {
    extend(out[0], out[1]);
    out.splice(1, 1);
  }
  return out;
}

/** Pieces to tell for a stretch: turn by turn indoors, in capital cities and inside dungeons. */
function legsOf(graph: WalkGraph, s: Stretch): Piece[] {
  const label = graph.labels[s.label];
  if (s.kind !== "walk" || !(label.indoor || label.city || graph.instance)) return [s];
  return pieces(s);
}

function areaName(graph: WalkGraph, label: number): string {
  const l = graph.labels[label];
  return l.name || l.zone;
}

function climb(p: Piece): string {
  const dz = (p.to.z ?? 0) - (p.from.z ?? 0);
  if (Math.abs(dz) < CLIMB_YARDS) return "";
  return dz > 0 ? `, climbing ${formatYards(dz)}` : `, going down ${formatYards(-dz)}`;
}

function turnText(before: Piece, p: Piece): string {
  const angle = turn(before, p);
  const side = angle > 0 ? "right" : "left";
  const sharp = Math.abs(angle) >= SHARP_TURN_DEGREES ? "sharp " : "";
  return `Turn ${sharp}${side} and head ${compassDirection(p.from, p.to)}, ${formatYards(p.yards)}${climb(p)}`;
}

/** " to The Mystic Ward" — where a lift / teleporter / drop puts you, unless that's where you were. */
function destination(graph: WalkGraph, before: Stretch | undefined, after: Stretch | undefined): string {
  const where = after ? areaName(graph, after.label) : "";
  return where && (!before || areaName(graph, before.label) !== where) ? ` to ${where}` : "";
}

/** "up to The Mystic Ward". */
function arrival(graph: WalkGraph, s: Stretch, before: Stretch | undefined, after: Stretch | undefined): string {
  const up = (s.to.z ?? 0) > (s.from.z ?? 0);
  return `${up ? "up" : "down"}${destination(graph, before, after)}`;
}

function stretchText(
  graph: WalkGraph,
  s: Stretch,
  head: Piece,
  before: Stretch | undefined,
  after: Stretch | undefined,
): string {
  const name = areaName(graph, s.label);
  const heading = compassDirection(head.from, head.to);
  if (s.kind === "lift") return `Ride the lift ${arrival(graph, s, before, after)}`;
  if (s.kind === "portal") {
    const near = Math.hypot(s.to.wx - s.from.wx, s.to.wy - s.from.wy) < TELEPORTER_YARDS;
    return near ? `Step on the teleporter ${arrival(graph, s, before, after)}` : `Take the portal to ${name}`;
  }
  // One way: there's no way back up the ledge or back through the teleporter.
  if (s.kind === "drop") return `Drop down from the ledge${destination(graph, before, after)} (no way back up)`;
  if (s.kind === "teleport") return `Step on the teleporter${destination(graph, before, after)} (one way)`;
  if (s.kind === "swim") return `Swim ${heading}, ${formatYards(head.yards)}${name ? ` across ${name}` : ""}`;
  const move = `head ${heading}, ${formatYards(head.yards)}`;
  const through = `${move}${name ? `, through ${name}` : ""}${climb(head)}`;
  // Off a lift / out of a portal / after a drop, the step before already named where you are.
  if (!before || !isMove(before)) return before ? `H${move.slice(1)}${climb(head)}` : `H${through.slice(1)}`;
  const indoor = graph.labels[s.label].indoor;
  const wasIndoor = graph.labels[before.label].indoor;
  const sameName = areaName(graph, before.label) === name;
  if (indoor && !wasIndoor) return sameName || !name ? `Go inside and ${move}${climb(head)}` : `Go into ${name} and ${move}${climb(head)}`;
  if (!indoor && wasIndoor) return sameName ? `Go outside and ${move}${climb(head)}` : `Go outside and ${through}`;
  return `H${through.slice(1)}`;
}

/** The lines of a path's directions, each with the stretch of path it covers. */
export function walkSteps(graph: WalkGraph, hops: readonly WalkHop[]): WalkStep[] {
  const list = stretches(graph, hops);
  return list.flatMap((s, i) => {
    const legs = legsOf(graph, s);
    return [
      { text: stretchText(graph, s, legs[0], list[i - 1], list[i + 1]), points: legs[0].points, label: s.label },
      ...legs.slice(1).map((p, k) => ({ text: turnText(legs[k], p), points: p.points, label: s.label })),
    ];
  });
}

/** Sub-step lines for a path (empty when it's one straight stretch). */
export function describeWalk(graph: WalkGraph, hops: readonly WalkHop[]): string[] {
  const steps = walkSteps(graph, hops);
  return steps.length < 2 ? [] : steps.map((s) => s.text);
}

/**
 * The walking leg between two graph nodes (`from` / `to` are the exact end
 * points, drawn at the path's ends), or null when nothing joins them.
 */
export function walkLeg(graph: WalkGraph, a: number, b: number, from: WorldPoint, to: WorldPoint): WalkLeg | null {
  const hops = walkPath(graph, a, b);
  if (!hops) return null;
  const path = [from, ...hops.map((h) => nodePoint(graph, h.node)), to];
  let yards = 0;
  for (let i = 1; i < path.length; i++) {
    // path[i] is hops[i - 1], reached by that hop's kind.
    if (i > hops.length || !isJump(hops[i - 1].kind)) yards += Math.hypot(path[i].wx - path[i - 1].wx, path[i].wy - path[i - 1].wy);
  }
  const steps = walkSteps(graph, hops);
  return {
    cost: searchFrom(graph, a).dist[b],
    yards,
    path,
    detail: steps.length < 2 ? [] : steps.map((s) => s.text),
    inside: steps.length < 2 ? [] : insideRuns(graph, hops, steps),
  };
}
