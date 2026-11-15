/** One talent tree a guild member has points in (from GET /api/wow/guilds/{slug}). */
export interface GuildMemberTalentTree {
  /** Blizzard's talent tree id; matches `tree.id` in the class talent JSON files. */
  tree_id: number;
  /** Total talent points spent in this tree. */
  points: number;
}
