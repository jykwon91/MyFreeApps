import type { GuildFaction } from "@/games/wow-forever/types/guild/guildFaction";
import type { GuildStanding } from "@/games/wow-forever/types/guild/guildStanding";

/** GET /api/wow/guilds/{slug}/reputations?faction=: the factions members have met and everyone's standing with one. */
export interface GuildReputations {
  /** The faction ``standings`` are for: the one asked for, else the one most members have met; null when nobody has one. */
  faction_id: number | null;
  /** Most members first, then by name. */
  factions: GuildFaction[];
  /** Members who have met ``faction_id``; others have no entry. */
  standings: GuildStanding[];
}
