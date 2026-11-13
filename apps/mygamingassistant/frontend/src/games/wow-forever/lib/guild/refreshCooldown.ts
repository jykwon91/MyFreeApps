import { GUILD_REFRESH_MS_PER_MINUTE } from "@/games/wow-forever/data/guild/guildRefreshConfig";
import type { GuildRefreshBaseline } from "@/games/wow-forever/types/guild/guildRefreshBaseline";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

/** Milliseconds until "Refresh now" works again; 0 when it already does. */
export function cooldownLeftMs(availableAt: string | null, nowMs: number): number {
  if (availableAt === null) return 0;
  return Math.max(new Date(availableAt).getTime() - nowMs, 0);
}

/** Whole minutes to show for a wait, rounded up (never "0 minutes"). */
export function cooldownMinutes(ms: number): number {
  return Math.max(Math.ceil(ms / GUILD_REFRESH_MS_PER_MINUTE), 1);
}

export function baselineOf(guild: GuildResponse): GuildRefreshBaseline {
  return { rosterUpdatedAt: guild.roster_updated_at, refreshFailedAt: guild.refresh_failed_at };
}

/** A refresh has finished once the roster time or the failure time is no longer what it was at the click. */
export function refreshFinished(baseline: GuildRefreshBaseline, guild: GuildResponse): boolean {
  return guild.roster_updated_at !== baseline.rosterUpdatedAt || guild.refresh_failed_at !== baseline.refreshFailedAt;
}
