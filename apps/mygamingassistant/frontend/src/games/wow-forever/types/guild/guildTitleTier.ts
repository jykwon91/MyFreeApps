import type { GUILD_TITLE_TIERS } from "@/games/wow-forever/data/guild/titleTiers";

/** A title's rarity, named for the game's item qualities. */
export type GuildTitleTier = (typeof GUILD_TITLE_TIERS)[keyof typeof GUILD_TITLE_TIERS];
