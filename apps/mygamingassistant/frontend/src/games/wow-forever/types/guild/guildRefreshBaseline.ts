/** What the guild said when "Refresh now" was clicked: a change in either means the refresh finished. */
export interface GuildRefreshBaseline {
  rosterUpdatedAt: string | null;
  refreshFailedAt: string | null;
}
