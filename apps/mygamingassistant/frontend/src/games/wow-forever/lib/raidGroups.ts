/**
 * The group planner's rules (`/wow-forever/raids/:webId/plan`): who sits where, moving a player, auto-fill, and what
 * a save sends. Pure — `hooks/useGroupPlan.ts` holds the state and changes it through these.
 *
 * A raid has `group_count` groups of five (`RaidPlan.group_count`); a seat is `{ group, slot }`, and its droppable id
 * `slot:<group>:<slot>`.
 */
import { DISPLAY_ROLE } from "@/games/wow-forever/data/raidPage";
import { GROUP_SIZE } from "@/games/wow-forever/data/raidPlanner";
import type { DisplayRole } from "@/games/wow-forever/types/raid";
import type { PlanPlayer, Placements, RaidPlan, RaidPlanSave, SlotRef } from "@/games/wow-forever/types/raidPlan";

const SLOT_ID = /^slot:(\d+):(\d+)$/;

/** How many of each role sit in a group. */
export type RoleTally = Readonly<Record<DisplayRole, number>>;

/** 1, 2, …, `count`. */
export function numbersTo(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

/** A seat's droppable id: "slot:2:3". */
export function slotId(seat: SlotRef): string {
  return `slot:${seat.group}:${seat.slot}`;
}

/** The seat a droppable id names; null for "Not in a group". */
export function parseSlotId(id: string): SlotRef | null {
  const match = SLOT_ID.exec(id);
  if (match === null) return null;
  return { group: Number(match[1]), slot: Number(match[2]) };
}

export function sameSeat(a: SlotRef | undefined, b: SlotRef | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.group === b.group && a.slot === b.slot;
}

/** Where the plan's players sit, as read. A group past `group_count` — the cap was lowered — holds nobody. */
export function placementsOf(plan: Pick<RaidPlan, "players" | "group_count">): Placements {
  const placements: Record<string, SlotRef> = {};
  for (const player of plan.players) {
    if (player.group === null || player.slot === null || player.group > plan.group_count) continue;
    placements[player.id] = { group: player.group, slot: player.slot };
  }
  return placements;
}

/** Whoever sits in `seat`. */
export function occupantOf(placements: Placements, seat: SlotRef): string | undefined {
  return Object.keys(placements).find((id) => sameSeat(placements[id], seat));
}

/**
 * `playerId` into `seat`; null takes them out of the groups. Onto someone, the two swap: the one sitting there takes
 * the mover's old seat, or goes to "Not in a group" when the mover came from there.
 */
export function swapOrPlace(placements: Placements, playerId: string, seat: SlotRef | null): Placements {
  const next: Record<string, SlotRef> = { ...placements };
  const from = placements[playerId];
  delete next[playerId];
  if (seat === null) return next;
  const occupant = occupantOf(placements, seat);
  if (occupant !== undefined && occupant !== playerId) {
    delete next[occupant];
    if (from !== undefined) next[occupant] = from;
  }
  next[playerId] = seat;
  return next;
}

/**
 * Fills empty seats with the players in no group, in line order, never moving anyone placed: tanks one per group
 * from Group 1, each healer to the group with the fewest (ties → the lowest number), melee from Group 1 up, ranged
 * from the last group down, then anyone without a role wherever there's room.
 */
export function autoFill(players: readonly PlanPlayer[], placements: Placements, groupCount: number): Placements {
  const next: Record<string, SlotRef> = { ...placements };
  const roles = new Map(players.map((player) => [player.id, player.role_group]));
  const firstFirst = numbersTo(groupCount);
  const lastFirst = [...firstFirst].reverse();
  const waiting = unplacedOf(players, placements);

  const seat = (player: PlanPlayer, group: number | undefined): void => {
    if (group === undefined) return;
    const slot = freeSlot(next, group);
    if (slot !== undefined) next[player.id] = { group, slot };
  };
  const withRoom = (order: readonly number[]): number[] => order.filter((group) => freeSlot(next, group) !== undefined);
  const fewest = (role: DisplayRole): number | undefined =>
    lowest(withRoom(firstFirst), (group) => roleCount(next, roles, group, role));

  for (const tank of withRole(waiting, DISPLAY_ROLE.TANK)) seat(tank, fewest(DISPLAY_ROLE.TANK));
  for (const healer of withRole(waiting, DISPLAY_ROLE.HEALER)) seat(healer, fewest(DISPLAY_ROLE.HEALER));
  for (const melee of withRole(waiting, DISPLAY_ROLE.MELEE)) seat(melee, withRoom(firstFirst)[0]);
  for (const ranged of withRole(waiting, DISPLAY_ROLE.RANGED)) seat(ranged, withRoom(lastFirst)[0]);
  for (const other of withRole(waiting, null)) seat(other, withRoom(firstFirst)[0]);
  return next;
}

/** The seated players in no group, in line order. */
export function unplacedOf(players: readonly PlanPlayer[], placements: Placements): PlanPlayer[] {
  return players.filter((player) => placements[player.id] === undefined).sort(byLine);
}

/** A group's five seats, in order: who sits in each, if anyone. */
export function seatsOf(
  players: readonly PlanPlayer[],
  placements: Placements,
  group: number,
): (PlanPlayer | undefined)[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  return numbersTo(GROUP_SIZE).map((slot) => {
    const id = occupantOf(placements, { group, slot });
    if (id === undefined) return undefined;
    return byId.get(id);
  });
}

export function roleTally(members: readonly (PlanPlayer | undefined)[]): RoleTally {
  const tally: Record<DisplayRole, number> = {
    [DISPLAY_ROLE.TANK]: 0,
    [DISPLAY_ROLE.HEALER]: 0,
    [DISPLAY_ROLE.MELEE]: 0,
    [DISPLAY_ROLE.RANGED]: 0,
  };
  for (const member of members) {
    if (member?.role_group) tally[member.role_group] += 1;
  }
  return tally;
}

/** What Save sends: every placed player, in group and seat order. */
export function toPayload(version: number, published: boolean, placements: Placements): RaidPlanSave {
  const assignments = Object.entries(placements)
    .map(([signupId, seat]) => ({ signup_id: signupId, group: seat.group, slot: seat.slot }))
    .sort((a, b) => a.group - b.group || a.slot - b.slot);
  return { version, published, assignments };
}

/** "G1: Bob, Alice" — a line per group with anyone in it, players in seat order; what [Copy as text] copies. */
export function asText(players: readonly PlanPlayer[], placements: Placements, groupCount: number): string {
  return numbersTo(groupCount)
    .map((group) => ({ group, names: seatsOf(players, placements, group).filter(isPlayer).map(nameOf) }))
    .filter(({ names }) => names.length > 0)
    .map(({ group, names }) => `G${group}: ${names.join(", ")}`)
    .join("\n");
}

export function samePlacements(a: Placements, b: Placements): boolean {
  const ids = Object.keys(a);
  if (ids.length !== Object.keys(b).length) return false;
  return ids.every((id) => sameSeat(a[id], b[id]));
}

function freeSlot(placements: Placements, group: number): number | undefined {
  return numbersTo(GROUP_SIZE).find((slot) => occupantOf(placements, { group, slot }) === undefined);
}

function roleCount(
  placements: Placements,
  roles: ReadonlyMap<string, DisplayRole | null>,
  group: number,
  role: DisplayRole,
): number {
  return Object.keys(placements).filter((id) => placements[id].group === group && roles.get(id) === role).length;
}

/** The first of `items` with the lowest `score`. */
function lowest(items: readonly number[], score: (item: number) => number): number | undefined {
  let best: number | undefined;
  for (const item of items) {
    if (best === undefined || score(item) < score(best)) best = item;
  }
  return best;
}

function withRole(players: readonly PlanPlayer[], role: DisplayRole | null): PlanPlayer[] {
  return players.filter((player) => player.role_group === role);
}

/** In line: by order number (none last), then name, so auto-fill always does the same thing. */
function byLine(a: PlanPlayer, b: PlanPlayer): number {
  return lineNumber(a) - lineNumber(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function lineNumber(player: PlanPlayer): number {
  return player.number ?? Number.MAX_SAFE_INTEGER;
}

function isPlayer(player: PlanPlayer | undefined): player is PlanPlayer {
  return player !== undefined;
}

function nameOf(player: PlanPlayer): string {
  return player.name;
}
