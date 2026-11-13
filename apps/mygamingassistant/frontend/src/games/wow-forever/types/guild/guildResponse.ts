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
  /** When the last failed refresh happened; changes with each failed try. */
  refresh_failed_at: string | null;
  /** This guild has a "Refresh now" button (only the operator's own guild does). */
  can_refresh: boolean;
  /** "Refresh now" works from this moment on; null when no one has asked for the roster yet. */
  refresh_available_at: string | null;
  /** Blizzard no longer has this guild. */
  gone: boolean;
  /** The gains boards' window: each member's baseline is their newest stored day at least this many days old. */
  gains_window_days: number;
  members: GuildMember[];
}
