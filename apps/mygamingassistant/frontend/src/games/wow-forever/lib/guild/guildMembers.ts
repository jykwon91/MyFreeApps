import {
  GUILD_DIRECTION_ASC,
  GUILD_DIRECTION_DESC,
  GUILD_LEVEL_BANDS,
  GUILD_MEMBER_STALE_HOURS,
  GUILD_PARAMS,
  GUILD_SORT_DESCENDING_FIRST,
  GUILD_SORT_KEYS,
  MS_PER_HOUR,
  type GuildSortKey,
} from "@/games/wow-forever/data/guild/guildConfig";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildMemberFilters } from "@/games/wow-forever/types/guild/guildMemberFilters";
import type { GuildMemberName } from "@/games/wow-forever/types/guild/guildMemberName";

const SORT_KEYS: readonly string[] = Object.values(GUILD_SORT_KEYS);

/** "Guild master" for rank 0, else "Rank N"; null when unranked. */
export function rankLabel(rank: number | null): string | null {
  if (rank === null) return null;
  return rank === 0 ? "Guild master" : `Rank ${rank}`;
}

export function memberFullName(member: GuildMemberName): string {
  return `${member.name} ${member.surname}`.trim();
}

export function isSortKey(value: string): value is GuildSortKey {
  return SORT_KEYS.includes(value);
}

/** The member list's state from the URL; anything unknown falls back to the default. */
export function filtersFromParams(params: URLSearchParams): GuildMemberFilters {
  const rawSort = params.get(GUILD_PARAMS.sort) ?? "";
  const sort = isSortKey(rawSort) ? rawSort : GUILD_SORT_KEYS.rank;
  const rawLevel = Number(params.get(GUILD_PARAMS.minLevel) ?? "0");
  const direction = params.get(GUILD_PARAMS.direction);
  return {
    query: params.get(GUILD_PARAMS.query) ?? "",
    className: params.get(GUILD_PARAMS.className) ?? "",
    minLevel: GUILD_LEVEL_BANDS.includes(rawLevel) ? rawLevel : 0,
    sort,
    descending: direction === null ? GUILD_SORT_DESCENDING_FIRST.has(sort) : direction === GUILD_DIRECTION_DESC,
  };
}

/** The URL params for a state, leaving defaults out so a plain link stays plain. */
export function paramsFromFilters(filters: GuildMemberFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set(GUILD_PARAMS.query, filters.query);
  if (filters.className) params.set(GUILD_PARAMS.className, filters.className);
  if (filters.minLevel) params.set(GUILD_PARAMS.minLevel, String(filters.minLevel));
  if (filters.sort !== GUILD_SORT_KEYS.rank) params.set(GUILD_PARAMS.sort, filters.sort);
  if (filters.descending !== GUILD_SORT_DESCENDING_FIRST.has(filters.sort)) {
    params.set(GUILD_PARAMS.direction, filters.descending ? GUILD_DIRECTION_DESC : GUILD_DIRECTION_ASC);
  }
  return params;
}

export function filterMembers(members: readonly GuildMember[], filters: GuildMemberFilters): GuildMember[] {
  const query = filters.query.trim().toLowerCase();
  return members.filter(
    (m) =>
      (!query || memberFullName(m).toLowerCase().includes(query)) &&
      (!filters.className || m.class_name === filters.className) &&
      (!filters.minLevel || (m.level !== null && m.level >= filters.minLevel)),
  );
}

function sortValue(member: GuildMember, key: GuildSortKey): number | string | null {
  switch (key) {
    case GUILD_SORT_KEYS.rank:
      return member.rank;
    case GUILD_SORT_KEYS.level:
      return member.level;
    case GUILD_SORT_KEYS.itemLevel:
      return member.item_level;
    case GUILD_SORT_KEYS.className:
      return member.class_name;
    case GUILD_SORT_KEYS.name:
      return memberFullName(member).toLowerCase();
  }
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Sorted by one column, then rank, level (highest first) and name. A member
 * missing the column's value always sorts last, in either direction — never as 0.
 */
export function sortMembers(members: readonly GuildMember[], sort: GuildSortKey, descending: boolean): GuildMember[] {
  const tieBreak = (a: GuildMember, b: GuildMember): number =>
    (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
    (b.level ?? -1) - (a.level ?? -1) ||
    memberFullName(a).localeCompare(memberFullName(b));
  return [...members].sort((a, b) => {
    const va = sortValue(a, sort);
    const vb = sortValue(b, sort);
    if (va === null && vb === null) return tieBreak(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    const order = compareValues(va, vb);
    return (descending ? -order : order) || tieBreak(a, b);
  });
}

/** Each class in the guild with its member count, by name. */
export function classCounts(members: readonly GuildMember[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const m of members) {
    if (m.class_name) counts.set(m.class_name, (counts.get(m.class_name) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** True when the member was refreshed well before the roster (their profile has stopped answering). */
export function isMemberStale(member: GuildMember, rosterUpdatedAt: string | null): boolean {
  if (!rosterUpdatedAt) return false;
  const gap = new Date(rosterUpdatedAt).getTime() - new Date(member.refreshed_at).getTime();
  return gap > GUILD_MEMBER_STALE_HOURS * MS_PER_HOUR;
}

/** Hours since an ISO time. */
export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / MS_PER_HOUR;
}
