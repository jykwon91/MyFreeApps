import type { GuildHelpMember } from "@/games/wow-forever/types/guild/guildHelpMember";

/** `GET /api/wow/guilds/{slug}/help` — raw sheet data for every live guild member. */
export interface GuildHelpResponse {
  members: GuildHelpMember[];
}
