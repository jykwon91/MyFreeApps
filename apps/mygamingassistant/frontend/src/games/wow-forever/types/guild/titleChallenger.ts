import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

/** The closest member behind a title's holders. */
export interface TitleChallenger {
  member: GuildMember;
  /** How far behind, in the board's own number (always above 0). */
  gap: number;
}
