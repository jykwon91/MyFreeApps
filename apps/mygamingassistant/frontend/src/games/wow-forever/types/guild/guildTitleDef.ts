import type { LucideIcon } from "lucide-react";
import type { GuildTitleTier } from "@/games/wow-forever/types/guild/guildTitleTier";

/** A guild title a board's leader earns (this site's, not an in-game title). */
export interface GuildTitleDef {
  title: string;
  icon: LucideIcon;
  /** What it's for, lower case: "most honorable kills". */
  earnedFor: string;
  tier: GuildTitleTier;
  /** One line in the game's voice. */
  flavor: string;
}
