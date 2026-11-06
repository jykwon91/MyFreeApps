import { LEVELING_SPEC_ID, roleFor, type WowClassId } from "@/games/wow-forever/data/classes";
import {
  CLOSE_SCORE_PCT,
  PRE_RAID_LEVEL,
  TOP_ITEMS_PER_SLOT,
} from "@/games/wow-forever/data/gear/gearPageConfig";
import { GEAR_SLOT_GROUPS } from "@/games/wow-forever/data/gear/gearSlotGroups";
import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";
import { NO_FACTS } from "@/games/wow-forever/gear/decodeGearData";
import { availableFrom } from "@/games/wow-forever/gear/gearAvailability";
import { canEquip, groupUsable, questOpenTo } from "@/games/wow-forever/gear/gearFilters";
import { fromClientData } from "@/games/wow-forever/lib/toCompareItem";
import { resolveWeights } from "@/games/wow-forever/scoring/resolveWeights";
import { scoreItem } from "@/games/wow-forever/scoring/scoreItem";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { GearRanking } from "@/games/wow-forever/types/gearRanking";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";
import type { GearSlotResult } from "@/games/wow-forever/types/gearSlotResult";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";

const PERCENT = 100;
/** Unknown-source items at these qualities and level 60 may be raid loot (listed apart). */
const RAID_LIKE_QUALITIES: ReadonlySet<ItemQuality> = new Set(["epic", "legendary", "artifact"]);
const UNKNOWN_SOURCE_DISCOUNT = 1 + CLOSE_SCORE_PCT / PERCENT;

/** Scored, obtainable items for one class — before they're put in slot cards. */
interface Candidate extends Omit<RankedGearItem, "pctOfBest" | "availableFrom"> {
  availableFrom: number | null;
}

/**
 * Sort key: a known-source item keeps its score; an item with no known source
 * counts as CLOSE_SCORE_PCT percent lower. So it only ranks above a known one
 * when it scores more than that much higher. One number per item, so the
 * order is consistent.
 */
export function effectiveScore(item: Pick<RankedGearItem, "score" | "sources">): number {
  return item.sources.length > 0 ? item.score : item.score / UNKNOWN_SOURCE_DISCOUNT;
}

export function compareRanked(a: Candidate, b: Candidate): number {
  return (
    effectiveScore(b) - effectiveScore(a) ||
    b.score - a.score ||
    (a.availableFrom ?? PRE_RAID_LEVEL) - (b.availableFrom ?? PRE_RAID_LEVEL) ||
    a.item.id - b.item.id
  );
}

function scorer(settings: GearSettings, leveling: boolean): (item: ClientItem, build: string) => number {
  const specId = leveling ? LEVELING_SPEC_ID : settings.specId;
  const { weights } = resolveWeights({
    classId: settings.classId,
    specId,
    bracket: leveling ? "leveling" : "level60",
    currentHitPct: null,
  });
  const ctx = { weights, role: roleFor(settings.classId, specId), currentHitPct: null };
  return (item, build) => scoreItem(fromClientData(String(item.id), item, build), ctx).total;
}

/** Items a player of this class and faction could get, scored — before slot and level checks. */
function candidates(
  items: readonly ClientItem[],
  data: GearData,
  settings: GearSettings,
  score: (item: ClientItem, build: string) => number,
): Candidate[] {
  const out: Candidate[] = [];
  for (const item of items) {
    if (item.randomSuffix || data.unobtainable.has(item.id)) continue;
    if (item.classes !== null && !item.classes.includes(settings.classId)) continue;
    const facts = data.facts.get(item.id) ?? NO_FACTS;
    if (facts.pvp && !settings.includePvp) continue;
    const all = data.sources.get(item.id) ?? [];
    const sources = all.filter((s) => questOpenTo(s, settings.classId, settings.faction));
    if (all.length > 0 && sources.length === 0) continue;
    const total = score(item, data.clientBuild);
    if (total <= 0) continue;
    out.push({ item, score: total, sources, facts, availableFrom: availableFrom(item, sources) });
  }
  return out;
}

/** Percent of the card's top pick (the first, already sorted) — over 100 when the close rule put it lower. */
function withPct(list: readonly Candidate[], fallbackLevel: number, best = list[0]?.score ?? 0): RankedGearItem[] {
  return list.map((c) => ({
    ...c,
    availableFrom: c.availableFrom ?? fallbackLevel,
    pctOfBest: best > 0 ? Math.round((c.score / best) * PERCENT) : PERCENT,
  }));
}

/** The next upgrade's percent is against the card's current best. */
function upgradeOver(next: Candidate, bar: number, level: number): RankedGearItem {
  const pctOfBest = bar > 0 ? Math.round((next.score / bar) * PERCENT) : PERCENT;
  return { ...next, availableFrom: next.availableFrom ?? level, pctOfBest };
}

function equippable(classId: WowClassId, list: readonly Candidate[], groupIndex: number, level: (c: Candidate) => number) {
  const group = GEAR_SLOT_GROUPS[groupIndex];
  return list.filter((c) => canEquip(c.item, group, classId, level(c)));
}

/** Level 60: top items per card; unknown-source epics are listed apart (may be raid loot). */
export function rankPreRaid(items: readonly ClientItem[], data: GearData, settings: GearSettings): GearRanking {
  const pool = candidates(items, data, settings, scorer(settings, false));
  const slots: GearSlotResult[] = [];
  GEAR_SLOT_GROUPS.forEach((group, index) => {
    if (!groupUsable(group, settings.classId)) return;
    const usable = equippable(settings.classId, pool, index, () => PRE_RAID_LEVEL);
    const isUnknownEpic = (c: Candidate) =>
      c.sources.length === 0 && RAID_LIKE_QUALITIES.has(c.item.quality) && c.item.requiredLevel >= PRE_RAID_LEVEL;
    const ranked = usable.filter((c) => !isUnknownEpic(c)).sort(compareRanked).slice(0, TOP_ITEMS_PER_SLOT);
    const epics = usable.filter(isUnknownEpic).sort(compareRanked).slice(0, TOP_ITEMS_PER_SLOT);
    slots.push({
      group,
      top: withPct(ranked, PRE_RAID_LEVEL),
      nextUpgrade: null,
      unknownEpics: withPct(epics, PRE_RAID_LEVEL, ranked[0]?.score ?? 0),
    });
  });
  return { slots, unknownLevelCount: 0 };
}

/** Leveling: the best items you can wear now, and the first better one later. */
export function rankLeveling(
  items: readonly ClientItem[],
  data: GearData,
  settings: GearSettings,
  level: number,
): GearRanking {
  const all = candidates(items, data, settings, scorer(settings, true));
  const pool = all.filter((c) => c.availableFrom !== null);
  const slots: GearSlotResult[] = [];
  const unknownLevel = new Set<number>();
  GEAR_SLOT_GROUPS.forEach((group, index) => {
    if (!groupUsable(group, settings.classId)) return;
    for (const c of all) {
      if (c.availableFrom === null && canEquip(c.item, group, settings.classId, PRE_RAID_LEVEL)) {
        unknownLevel.add(c.item.id);
      }
    }
    const atLevel = (c: Candidate) => Math.max(level, c.availableFrom ?? level);
    const usable = equippable(settings.classId, pool, index, atLevel);
    const now = usable.filter((c) => (c.availableFrom ?? 0) <= level).sort(compareRanked);
    const top = now.slice(0, TOP_ITEMS_PER_SLOT);
    const bar = top[0]?.score ?? 0;
    const later = usable
      .filter((c) => (c.availableFrom ?? 0) > level && c.score > bar)
      .sort((a, b) => (a.availableFrom ?? 0) - (b.availableFrom ?? 0) || compareRanked(a, b));
    const next = later[0] ?? null;
    slots.push({
      group,
      top: withPct(top, level),
      nextUpgrade: next ? upgradeOver(next, bar, level) : null,
      unknownEpics: [],
    });
  });
  return { slots, unknownLevelCount: unknownLevel.size };
}
