import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

/** A title the viewer could take, and what it would take. */
export interface GuildQuest {
  title: GuildTitle;
  /** "17 more HKs to take Bloodletter from Rathgar". */
  text: string;
  /** How far the viewer is from the holder, as a share of the larger number; smaller = closer. */
  relativeGap: number;
}
