import type { GuildMatch } from "@/games/wow-forever/types/guild/guildMatch";

/** The best enchant found so far for one (beneficiary, slot), and what it's worth to them. */
export interface BestEnchant {
  value: number;
  match: GuildMatch;
}
