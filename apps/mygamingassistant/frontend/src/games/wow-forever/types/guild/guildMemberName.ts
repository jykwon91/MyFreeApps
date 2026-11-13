import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

/** Enough of a guild member to name them in class colour and link to their character page. */
export type GuildMemberName = Pick<GuildMember, "slug" | "name" | "surname" | "class_name">;
