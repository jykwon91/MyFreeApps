import type { GuildRefreshBaseline } from "@/games/wow-forever/types/guild/guildRefreshBaseline";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

export function baselineOf(guild: GuildResponse): GuildRefreshBaseline {
  return { rosterUpdatedAt: guild.roster_updated_at, refreshFailedAt: guild.refresh_failed_at };
}

/** A refresh has finished once the roster time or the failure time is no longer what it was at the click. */
export function refreshFinished(baseline: GuildRefreshBaseline, guild: GuildResponse): boolean {
  return guild.roster_updated_at !== baseline.rosterUpdatedAt || guild.refresh_failed_at !== baseline.refreshFailedAt;
}
