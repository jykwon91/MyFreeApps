import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

/** A stored WoW Forever guild (GET /api/wow/guilds/{slug}). */
export interface GuildResponse {
  slug: string;
  name: string;
  /** alliance / horde */
  faction: string;
  /** Members on Blizzard's roster at the last refresh; null before the first. */
  roster_size: number | null;
  roster_updated_at: string | null;
  /** The last refresh failed; the members are from roster_updated_at. */
  refresh_failed: boolean;
  /** Blizzard no longer has this guild. */
  gone: boolean;
  /** The gains boards' window: each member's baseline is their newest stored day at least this many days old. */
  gains_window_days: number;
  members: GuildMember[];
}
