import { STANDING_NAMES } from "@/games/wow-forever/data/character/characterReputationConfig";
import { STANDING_SCORE_TIER_SPAN } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import { rankEntries } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { GuildFaction } from "@/games/wow-forever/types/guild/guildFaction";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildStanding } from "@/games/wow-forever/types/guild/guildStanding";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

/** A standing as one number: tier first, then progress within it. */
export function standingScore(standing: GuildStanding): number {
  return standing.tier * STANDING_SCORE_TIER_SPAN + standing.value;
}

/** The members' standings with the faction, best first: "Honored" with "6,550 / 12,000" under the name. */
export function rankStandings(members: readonly GuildMember[], standings: readonly GuildStanding[]): LeaderboardEntry[] {
  const bySlug = new Map(members.map((m) => [m.slug, m]));
  const entries = standings.flatMap((standing) => {
    const member = bySlug.get(standing.slug);
    if (!member) return [];
    // Exalted can come with nothing left to fill (max 0): the tier says it all.
    const detail = standing.max > 0 ? `${formatWhole(standing.value)} / ${formatWhole(standing.max)}` : null;
    return [{ member, value: standingScore(standing), display: STANDING_NAMES[standing.tier] ?? "", detail }];
  });
  return rankEntries(entries, false);
}

/** A faction picker option: "Ironforge (31 members)". */
export function factionOptionLabel(faction: GuildFaction): string {
  return `${faction.name} (${formatCount(faction.members, "member", "members")})`;
}

/** The line above the faction board: "One faction's standing: 10 of 31 shown · ranked by standing with Ironforge". */
export function standingStatus(boardLabel: string, factionName: string, shown: number, ranked: number): string {
  return `${boardLabel}: ${shown} of ${ranked} shown · ranked by standing with ${factionName}`;
}

/** The footnote under a faction board: how many members have no standing with it. */
export function factionUnrankedNote(count: number, factionName: string): string {
  return `${formatCount(count, "member has", "members have")} no standing with ${factionName} that we know of, so they're not ranked.`;
}
