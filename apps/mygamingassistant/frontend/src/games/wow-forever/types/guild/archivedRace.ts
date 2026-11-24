import type { GuildMemberName } from "@/games/wow-forever/types/guild/guildMemberName";

/** A guild race that's over: who won it, and the day only when we recorded it (never guessed). */
export interface ArchivedRace {
  id: string;
  /** The record's name: "Race to 60". */
  title: string;
  /** What the winner did: "first to level 60". */
  achievement: string;
  winner: GuildMemberName;
  /** A stored UTC day ("2026-11-12"), or null when nothing recorded when it happened. */
  day: string | null;
}
