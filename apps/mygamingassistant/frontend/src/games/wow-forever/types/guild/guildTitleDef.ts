import type { LucideIcon } from "lucide-react";

/** A guild title a board's leader earns (this site's, not an in-game title). */
export interface GuildTitleDef {
  title: string;
  icon: LucideIcon;
  /** What it's for, lower case: "most honorable kills". */
  earnedFor: string;
}
