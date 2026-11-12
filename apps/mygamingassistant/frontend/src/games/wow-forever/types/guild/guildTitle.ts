import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitleDef } from "@/games/wow-forever/types/guild/guildTitleDef";

/** A title as awarded: its board's leaders hold it (ties share it). */
export interface GuildTitle extends GuildTitleDef {
  boardId: string;
  /** From a "This week" gains board. */
  weekly: boolean;
  holders: GuildMember[];
  /** The leaders' number, as the board shows it ("1,204", "+40", "300 / 300"). */
  display: string;
}
