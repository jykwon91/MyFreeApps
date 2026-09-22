import { roleFor } from "@/games/wow-forever/data/classes";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { explainWinner } from "@/games/wow-forever/scoring/explainWinner";
import { hitCapRuleFor } from "@/games/wow-forever/scoring/hitCap";
import { resolveWeights } from "@/games/wow-forever/scoring/resolveWeights";
import { hasScorableContent, scoreItem } from "@/games/wow-forever/scoring/scoreItem";
import type {
  BreakdownLine,
  CompareResult,
  RankedItem,
  ScoreRowKey,
} from "@/games/wow-forever/scoring/scoreTypes";
import { slotMismatchWarning } from "@/games/wow-forever/scoring/slotGroups";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";
import type { CompareSettings } from "@/games/wow-forever/types/compareSettings";

const TIE_EPSILON = 0.01;
const PERCENT = 100;

function buildBreakdown(ranked: RankedItem[]): BreakdownLine[] {
  const order: ScoreRowKey[] = [];
  const labels = new Map<ScoreRowKey, string>();
  const scored = new Map<ScoreRowKey, boolean>();
  for (const { score } of ranked) {
    for (const row of score.rows) {
      if (!labels.has(row.key)) order.push(row.key);
      labels.set(row.key, row.label);
      scored.set(row.key, (scored.get(row.key) ?? false) || row.weight !== null);
    }
  }
  const lines = order.map((key) => ({
    key,
    label: labels.get(key) ?? key,
    cells: ranked.map(({ score }) => score.rows.find((r) => r.key === key) ?? null),
    scored: scored.get(key) ?? false,
  }));
  // Scored rows first; "not scored" rows at the bottom.
  return [...lines.filter((l) => l.scored), ...lines.filter((l) => !l.scored)];
}

function pctOfBest(total: number, best: number): number {
  if (best <= 0) return total >= best ? PERCENT : 0;
  return Math.round((total / best) * PERCENT);
}

/** Boss hit caps only matter at level 60; the hit % field is only shown there. */
function currentHitFor(settings: CompareSettings): number | null {
  if (settings.bracket !== "level60") return null;
  return settings.currentHitPct;
}

function hitNotes(items: CompareItem[], settings: CompareSettings): string[] {
  if (settings.bracket !== "level60" || settings.currentHitPct !== null) return [];
  const rule = hitCapRuleFor(roleFor(settings.classId, settings.specId));
  const anyHit = items.some((i) => (i.stats[rule.stat] ?? 0) > 0);
  if (!anyHit) return [];
  return [
    `${rule.label[0].toUpperCase()}${rule.label.slice(1)} stops helping at about ${rule.capPct}% against bosses. ` +
      "Enter your current hit % to account for it — otherwise all hit is counted.",
  ];
}

/** Score, rank and explain a set of items for the chosen class/spec/bracket. */
export function compareItems(items: CompareItem[], settings: CompareSettings): CompareResult {
  const { weights, source, notes: weightNotes } = resolveWeights(settings);
  const role = roleFor(settings.classId, settings.specId);
  const ctx = { weights, role, currentHitPct: currentHitFor(settings) };

  const scorable = items.filter(hasScorableContent);
  const scored = scorable
    .map((item) => ({ item, score: scoreItem(item, ctx) }))
    .sort((a, b) => b.score.total - a.score.total);
  const best = scored[0]?.score.total ?? 0;
  const ranked: RankedItem[] = scored.map((s) => ({ ...s, pctOfBest: pctOfBest(s.score.total, best) }));

  const warnings: string[] = [];
  const mismatch = slotMismatchWarning(scorable.map((i): ItemSlot | null => i.slot));
  if (mismatch) warnings.push(mismatch);

  const notes = [...weightNotes, ...hitNotes(scorable, settings)];
  const ready = ranked.length >= 2;
  const isTie = ready && Math.abs(ranked[0].score.total - ranked[1].score.total) < TIE_EPSILON;

  let winner: CompareItem | null = null;
  let why: string[] = [];
  if (ready && isTie) {
    why = [`${ranked[0].item.name} and ${ranked[1].item.name} score the same for this spec.`];
  } else if (ready) {
    winner = ranked[0].item;
    why = explainWinner(ranked[0], ranked[1]);
  }

  return { ready, ranked, winner, isTie, why, breakdown: buildBreakdown(ranked), warnings, notes, weightSource: source };
}
