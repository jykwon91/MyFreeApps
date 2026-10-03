/** The group planner's words: tallies, the raid's size, a player's handle, Move-to options and the save toast. */
import { DISPLAY_ROLE } from "@/games/wow-forever/data/raidPage";
import { PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";
import type { RoleTally } from "@/games/wow-forever/lib/raidGroups";
import type { DisplayRole } from "@/games/wow-forever/types/raid";
import type { PlanPlayer } from "@/games/wow-forever/types/raidPlan";

const TALLY_ORDER: readonly DisplayRole[] = [
  DISPLAY_ROLE.TANK,
  DISPLAY_ROLE.HEALER,
  DISPLAY_ROLE.MELEE,
  DISPLAY_ROLE.RANGED,
];

/** Each role's letter, then its word for one and for several. */
const TALLY_WORDS: Readonly<Record<DisplayRole, readonly [letter: string, one: string, several: string]>> = {
  [DISPLAY_ROLE.TANK]: ["T", "tank", "tanks"],
  [DISPLAY_ROLE.HEALER]: ["H", "healer", "healers"],
  [DISPLAY_ROLE.MELEE]: ["M", "melee", "melee"],
  [DISPLAY_ROLE.RANGED]: ["R", "ranged", "ranged"],
};

/** "T1 H1 M2 R1". */
export function tallyShort(tally: RoleTally): string {
  return TALLY_ORDER.map((role) => `${TALLY_WORDS[role][0]}${tally[role]}`).join(" ");
}

/** "1 tank, 2 healers, 2 melee, 0 ranged" — the tally, for a screen reader. */
export function tallyLong(tally: RoleTally): string {
  return TALLY_ORDER.map((role) => {
    const [, one, several] = TALLY_WORDS[role];
    return `${tally[role]} ${plural(tally[role], one, several)}`;
  }).join(", ");
}

/** "40-man (8 groups)". */
export function sizeLabel(sizeCap: number, groupCount: number): string {
  return `${sizeCap}-man (${groupCount} ${plural(groupCount, "group", "groups")})`;
}

/** A drag handle's name: "Garrosh, Protection Warrior, late". */
export function chipLabel(player: Pick<PlanPlayer, "name" | "spec" | "late">): string {
  const parts = [player.name];
  if (player.spec) parts.push(player.spec);
  if (player.late) parts.push("late");
  return parts.join(", ");
}

/** A Move-to option: "Slot 3 — empty", "Slot 3 — swap with Alice", or "Slot 3 — here". */
export function moveOptionLabel(slot: number, occupant: string | undefined, isHere: boolean): string {
  if (isHere) return `Slot ${slot} — here`;
  if (occupant === undefined) return `Slot ${slot} — empty`;
  return `Slot ${slot} — swap with ${occupant}`;
}

/** "Groups saved", and who was taken out for having lost their seat while the leader planned. */
export function savedMessage(droppedCount: number): string {
  if (droppedCount === 0) return PLANNER_MESSAGE.SAVED;
  if (droppedCount === 1) return `${PLANNER_MESSAGE.SAVED} — 1 player who left their seat was taken out.`;
  return `${PLANNER_MESSAGE.SAVED} — ${droppedCount} players who left their seats were taken out.`;
}

/** "Not in a group yet: 3 seated players" — under the groups on the raid page. */
export function unplacedLabel(count: number): string {
  return `Not in a group yet: ${count} seated ${plural(count, "player", "players")}`;
}

function plural(count: number, one: string, several: string): string {
  if (count === 1) return one;
  return several;
}
