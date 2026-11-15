import type { ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";

/** The part of a route between two skills: rows outside are dropped, rows across an end are cut at it. */
export function clipRoute(entries: readonly ResolvedRouteEntry[], from: number, to: number): ResolvedRouteEntry[] {
  return entries.flatMap((entry): ResolvedRouteEntry[] => {
    const start = Math.max(entry.step.from, from);
    const end = Math.min(entry.step.to, to);
    if (end <= start) return [];
    if (entry.kind === "craft") return [{ ...entry, step: { ...entry.step, from: start, to: end } }];
    return [{ ...entry, step: { ...entry.step, from: start, to: end } }];
  });
}
