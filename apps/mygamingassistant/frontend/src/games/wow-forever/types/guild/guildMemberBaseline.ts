/** What the gains boards count a member from: their numbers on an older stored day. null = Blizzard didn't send it. */
export interface GuildMemberBaseline {
  /** The stored day (UTC, "2026-11-12"). */
  day: string;
  level: number | null;
  honorable_kills: number | null;
  killing_blows: number | null;
  total_kills: number | null;
  dungeons_done: number | null;
}
