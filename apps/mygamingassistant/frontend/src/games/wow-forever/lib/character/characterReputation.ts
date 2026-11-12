import reputationGroups from "@/games/wow-forever/data/character/reputationGroups.json";
import {
  NO_REPUTATIONS_NOTE,
  OTHER_GROUP_ID,
  OTHER_GROUP_NAME,
  REPUTATIONS_FAILED_NOTE,
  STANDING_BARS,
  STANDING_TIER,
  STANDING_TONES,
  STEAMWHEEDLE_GROUP_ID,
} from "@/games/wow-forever/data/character/characterReputationConfig";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import type { CharacterReputation } from "@/games/wow-forever/types/character/characterReputation";
import type { CharacterReputationGroup } from "@/games/wow-forever/types/character/characterReputationGroup";
import type { ReputationGroupData } from "@/games/wow-forever/types/character/reputationGroupData";

const GROUPS: readonly ReputationGroupData[] = reputationGroups.groups;

const GROUP_BY_FACTION: ReadonlyMap<number, ReputationGroupData> = new Map(
  GROUPS.flatMap((group) => group.factions.map((factionId) => [factionId, group] as const)),
);

const HEADER_IDS: ReadonlySet<number> = new Set(GROUPS.map((group) => group.id));

/** The character's own side first, then headers both sides share, then the other side's. */
function groupRank(group: ReputationGroupData, side: string): number {
  if (group.side === side) return 0;
  if (group.side === null) return 1;
  return 2;
}

function byName(a: CharacterReputation, b: CharacterReputation): number {
  return a.name.localeCompare(b.name);
}

function clampTier(tier: number): number {
  return Math.max(STANDING_TIER.hated, Math.min(STANDING_TIER.exalted, tier));
}

/**
 * The character's reputations under the pane's headers, each list alphabetical
 * as in game, "Other" last. A faction under no header (or one newer than our
 * data) goes in "Other", so nothing is dropped; a header sent as a row is skipped.
 */
export function groupReputations(reputations: readonly CharacterReputation[], side: string): CharacterReputationGroup[] {
  const byGroup = new Map<number, CharacterReputation[]>();
  for (const reputation of reputations) {
    if (HEADER_IDS.has(reputation.id)) continue;
    const groupId = GROUP_BY_FACTION.get(reputation.id)?.id ?? OTHER_GROUP_ID;
    byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), reputation]);
  }
  const headed: CharacterReputationGroup[] = [...GROUPS]
    .filter((group) => byGroup.has(group.id))
    .sort((a, b) => groupRank(a, side) - groupRank(b, side) || a.id - b.id)
    .map((group) => ({ id: group.id, name: group.name, reputations: [...(byGroup.get(group.id) ?? [])].sort(byName) }));
  const other = byGroup.get(OTHER_GROUP_ID);
  if (!other) return headed;
  return [...headed, { id: OTHER_GROUP_ID, name: OTHER_GROUP_NAME, reputations: [...other].sort(byName) }];
}

/** Why the section shows a note instead of reputations, or null when there are some. */
export function characterReputationsNote(reputations: readonly CharacterReputation[] | null): string | null {
  if (reputations === null) return REPUTATIONS_FAILED_NOTE;
  if (reputations.length === 0) return NO_REPUTATIONS_NOTE;
  return null;
}

/** Exalted's cap: nothing left to earn, so no bar or numbers. */
export function isAtCap(reputation: CharacterReputation): boolean {
  return reputation.max <= 0;
}

/** How far through the standing, 0-100, for the bar. */
export function standingPercent(reputation: CharacterReputation): number {
  if (isAtCap(reputation)) return 100;
  return Math.max(0, Math.min(100, (reputation.value / reputation.max) * 100));
}

/** "7,888 / 12,000". */
export function formatStandingProgress(reputation: CharacterReputation): string {
  return `${formatWhole(reputation.value)} / ${formatWhole(reputation.max)}`;
}

/** The standing label's colours. */
export function standingTone(tier: number): string {
  return STANDING_TONES[clampTier(tier)];
}

/** The bar's fill colour. */
export function standingBar(tier: number): string {
  return STANDING_BARS[clampTier(tier)];
}

/** A Steamwheedle town at Hostile or worse: its guards attack the character (Unfriendly only refuses to trade). */
export function guardsAttack(groupId: number, tier: number): boolean {
  return groupId === STEAMWHEEDLE_GROUP_ID && tier <= STANDING_TIER.hostile;
}

/** "4 factions" / "1 faction". */
export function formatFactionCount(count: number): string {
  const noun = count === 1 ? "faction" : "factions";
  return `${count} ${noun}`;
}
