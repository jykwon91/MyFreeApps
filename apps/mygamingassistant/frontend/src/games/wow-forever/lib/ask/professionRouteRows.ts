/**
 * A profession route as the "Ask" card's rows, from the player's skill on:
 * crafting rows say how many crafts, the materials for all of them and where
 * the recipe is learned (the same numbers as the guide's route); hand-written
 * rows keep their own words, for the player's faction.
 */
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { currentEntryIndex, expectedCrafts } from "@/games/wow-forever/crafting/craftRoute";
import { learnText } from "@/games/wow-forever/crafting/learnText";
import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import { forFaction } from "@/games/wow-forever/lib/forFaction";
import { routeStepEnd } from "@/games/wow-forever/lib/professions/routeStepEnd";
import type { AskGuideRow } from "@/games/wow-forever/types/ask/askGuideRow";
import type { AskProfessionRoute } from "@/games/wow-forever/types/ask/askProfessionRoute";
import type { AskRouteRows } from "@/games/wow-forever/types/ask/askRouteRows";
import type { ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

function badge(confidence: "confirmed" | "unconfirmed"): ProvenanceTag | null {
  return confidence === "unconfirmed" ? { provenance: PROVENANCE.unconfirmed } : null;
}

function craftingRow(entry: ResolvedRouteEntry, skill: number | null, label: string): AskGuideRow {
  if (entry.kind === "options") {
    const choices = entry.step.options.map((o, i) => `${entry.recipes[i].name} — ${o.detail}`);
    return {
      skill: `${entry.step.from}–${entry.step.to}`,
      name: entry.step.title,
      lines: [entry.step.intro, ...choices],
      provenance: badge(entry.step.confidence),
    };
  }
  const from = Math.max(entry.step.from, skill ?? entry.step.from);
  const crafts = expectedCrafts(entry.recipe, from, entry.step.to);
  const counted = Number.isFinite(crafts);
  const materials = entry.recipe.reagents.map((r) => (counted ? `${r.count * crafts} ${r.name}` : r.name)).join(", ");
  return {
    skill: `${from}–${entry.step.to}`,
    name: entry.recipe.name,
    lines: [
      ...(counted ? [ASK_COPY.crafts(crafts)] : []),
      ...(materials ? [ASK_COPY.materials(materials)] : []),
      ASK_COPY.learn(learnText(entry.learn, label)),
      ...(entry.step.note ? [entry.step.note] : []),
    ],
    provenance: badge(entry.step.confidence),
  };
}

function guideRow(step: RouteStep, faction: PlayerFaction): AskGuideRow {
  if (step.kind === "milestone") {
    return { skill: step.skill, name: step.name, lines: [forFaction(step.detail, faction)], provenance: badge(step.confidence) };
  }
  return {
    skill: step.skill,
    name: step.name,
    lines: [
      ASK_COPY.materials(forFaction(step.materials, faction)),
      ASK_COPY.learn(forFaction(step.source, faction)),
      ...(step.note ? [step.note] : []),
    ],
    provenance: badge(step.confidence),
  };
}

/** The row you're on at `skill` (a hand-written step ending at or below it is done). */
function guideIndex(steps: readonly RouteStep[], skill: number | null): number {
  if (skill === null) return 0;
  const index = steps.findIndex((s) => (routeStepEnd(s.skill) ?? 0) > skill);
  return index === -1 ? steps.length : index;
}

export function professionRouteRows(
  route: AskProfessionRoute,
  skill: number | null,
  { label, faction, max }: { label: string; faction: PlayerFaction; max: number },
): AskRouteRows {
  if (route.kind === "crafting") {
    const start = currentEntryIndex(route.entries, skill) ?? 0;
    const shown = route.entries.slice(start, start + max);
    return {
      rows: shown.map((e) => craftingRow(e, skill, label)),
      more: Math.max(0, route.entries.length - start - shown.length),
      done: start >= route.entries.length,
    };
  }
  const start = guideIndex(route.steps, skill);
  const shown = route.steps.slice(start, start + max);
  return {
    rows: shown.map((s) => guideRow(s, faction)),
    more: Math.max(0, route.steps.length - start - shown.length),
    done: start >= route.steps.length,
  };
}
