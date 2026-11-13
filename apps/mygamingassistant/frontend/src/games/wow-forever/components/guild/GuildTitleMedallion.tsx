import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  TITLE_ICON_SIZE,
  TITLE_MEDALLION,
  TITLE_MEDALLION_SIZE,
  TITLE_SHINE,
} from "@/games/wow-forever/data/guild/guildStyles";
import { GUILD_TITLE_TIER_STYLES } from "@/games/wow-forever/data/guild/titleTiers";
import type { GuildTitleTier } from "@/games/wow-forever/types/guild/guildTitleTier";

interface GuildTitleMedallionProps {
  icon: LucideIcon;
  tier: GuildTitleTier;
  size: keyof typeof TITLE_MEDALLION_SIZE;
}

/** A title's emblem: its icon on a shield in the tier's colours, with a slow shine across the epic and legendary ones. Decorative. */
export default function GuildTitleMedallion({ icon: Icon, tier, size }: GuildTitleMedallionProps) {
  const style = GUILD_TITLE_TIER_STYLES[tier];
  return (
    <span aria-hidden className={clsx(TITLE_MEDALLION, TITLE_MEDALLION_SIZE[size], style.medallion)}>
      <Icon className={TITLE_ICON_SIZE[size]} strokeWidth={2.25} />
      {style.shine ? <span className={TITLE_SHINE} /> : null}
    </span>
  );
}
