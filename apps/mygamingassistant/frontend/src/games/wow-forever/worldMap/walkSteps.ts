/**
 * A walking leg over the walk graph, told the way you'd tell a friend:
 * "Go into The Great Forge and head east, ~60 yd", "Ride the lift up",
 * "Swim north, ~120 yd". The path is split into stretches by the area it
 * crosses (room / sub-area), swimming vs walking, and lifts / portals.
 */
import type { WorldPoint } from "@/games/wow-forever/types/worldMap";
import { compassDirection, formatYards } from "@/games/wow-forever/worldMap/geometry";
import {
  nodePoint,
  searchFrom,
  walkPath,
  WALK_EDGE,
  type WalkGraph,
  type WalkHop,
} from "@/games/wow-forever/worldMap/walkGraph";

/** A stretch shorter than this is folded into the one before it — "head north, ~10 yd" is noise. */
const MIN_STRETCH_YARDS = 25;
/** Height change worth mentioning on a stretch. */
const CLIMB_YARDS = 8;

export interface WalkLeg {
  /** Ground yards (run-speed yards, swimming counted slower). */
  cost: number;
  /** Yards actually covered. */
  yards: number;
  /** The path on the map, start to end. */
  path: WorldPoint[];
  /** Sub-steps; empty when the leg is one stretch (the step's own text says it all). */
  detail: string[];
}

type StretchKind = "walk" | "swim" | "lift" | "portal";

interface Stretch {
  kind: StretchKind;
  label: number;
  from: WorldPoint;
  to: WorldPoint;
  yards: number;
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.wx - b.wx, a.wy - b.wy, (a.z ?? 0) - (b.z ?? 0));
}

function hopKind(graph: WalkGraph, hop: WalkHop): StretchKind {
  if (hop.kind === WALK_EDGE.lift) return "lift";
  if (hop.kind === WALK_EDGE.portal) return "portal";
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

/** Consecutive walks (or swims) through the same area become one stretch. */
function joined(graph: WalkGraph, list: readonly Stretch[]): Stretch[] {
  const out: Stretch[] = [];
  for (const s of list) {
    const last = out[out.length - 1];
    if (last && isMove(s) && last.kind === s.kind && sameArea(graph, last.label, s.label)) {
      last.to = s.to;
      last.yards += s.yards;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function stretches(graph: WalkGraph, hops: readonly WalkHop[]): Stretch[] {
  const raw: Stretch[] = [];
  for (let i = 1; i < hops.length; i++) {
    const from = nodePoint(graph, hops[i - 1].node);
    const to = nodePoint(graph, hops[i].node);
    raw.push({ kind: hopKind(graph, hops[i]), label: graph.label[hops[i].node], from, to, yards: distance(from, to) });
  }
  // Fold short walks / swims into a neighbour so the list reads like directions, not a trace.
  const folded: Stretch[] = [];
  for (const s of joined(graph, raw)) {
    const last = folded[folded.length - 1];
    if (last && isMove(last) && isMove(s) && s.yards < MIN_STRETCH_YARDS) {
      last.to = s.to;
      last.yards += s.yards;
    } else if (last && isMove(last) && isMove(s) && folded.length === 1 && last.yards < MIN_STRETCH_YARDS) {
      folded[0] = { ...s, from: last.from, yards: last.yards + s.yards };
    } else {
      folded.push(s);
    }
  }
  return joined(graph, folded);
}

function areaName(graph: WalkGraph, label: number): string {
  const l = graph.labels[label];
  return l.name || l.zone;
}

function climb(s: Stretch): string {
  const dz = (s.to.z ?? 0) - (s.from.z ?? 0);
  if (Math.abs(dz) < CLIMB_YARDS) return "";
  return dz > 0 ? `, climbing ${formatYards(dz)}` : `, going down ${formatYards(-dz)}`;
}

function stretchText(graph: WalkGraph, s: Stretch, before: Stretch | undefined, after: Stretch | undefined): string {
  const name = areaName(graph, s.label);
  const heading = compassDirection(s.from, s.to);
  if (s.kind === "lift") {
    const up = (s.to.z ?? 0) > (s.from.z ?? 0);
    return `Ride the lift ${up ? "up" : "down"}${after ? ` to ${areaName(graph, after.label)}` : ""}`;
  }
  if (s.kind === "portal") return `Take the portal to ${name}`;
  if (s.kind === "swim") return `Swim ${heading}, ${formatYards(s.yards)}${name ? ` across ${name}` : ""}`;
  const move = `head ${heading}, ${formatYards(s.yards)}`;
  const through = `${move}, through ${name}${climb(s)}`;
  // Off a lift / out of a portal, the step before already named where you are.
  if (!before || !isMove(before)) return before ? `H${move.slice(1)}${climb(s)}` : `H${through.slice(1)}`;
  const indoor = graph.labels[s.label].indoor;
  const wasIndoor = graph.labels[before.label].indoor;
  const sameName = areaName(graph, before.label) === name;
  if (indoor && !wasIndoor) return sameName ? `Go inside and ${move}${climb(s)}` : `Go into ${name} and ${move}${climb(s)}`;
  if (!indoor && wasIndoor) return sameName ? `Go outside and ${move}${climb(s)}` : `Go outside and ${through}`;
  return `H${through.slice(1)}`;
}

/** Sub-step lines for a path (empty when it's a single stretch). */
export function describeWalk(graph: WalkGraph, hops: readonly WalkHop[]): string[] {
  const list = stretches(graph, hops);
  if (list.length < 2) return [];
  return list.map((s, i) => stretchText(graph, s, list[i - 1], list[i + 1]));
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
  for (let i = 1; i < path.length; i++) yards += Math.hypot(path[i].wx - path[i - 1].wx, path[i].wy - path[i - 1].wy);
  return { cost: searchFrom(graph, a).dist[b], yards, path, detail: describeWalk(graph, hops) };
}
