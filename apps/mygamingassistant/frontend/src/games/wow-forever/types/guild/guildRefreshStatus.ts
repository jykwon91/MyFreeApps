/** What POST /api/wow/guilds/{slug}/refresh did: started a refresh, or the guild was asked for too recently. */
export type GuildRefreshStatus = "started" | "cooldown";
