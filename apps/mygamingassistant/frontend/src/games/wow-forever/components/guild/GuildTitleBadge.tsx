import clsx from "clsx";
import GuildTitleMedallion from "@/games/wow-forever/components/guild/GuildTitleMedallion";
import { GUILD_TITLE_COPY } from "@/games/wow-forever/data/guild/guildTitles";
import { TITLE_MEDALLION_SIZE, TITLE_PILL, TITLE_PIP } from "@/games/wow-forever/data/guild/guildStyles";
import { GUILD_TITLE_TIER_STYLES } from "@/games/wow-forever/data/guild/titleTiers";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildTitleBadgeProps {
  title: GuildTitle;
  /** "card": the big medallion on a title card. "inline": a tinted pill with a small one, by a member's name. */
  size: keyof typeof TITLE_MEDALLION_SIZE;
}

/**
 * A guild title as a rarity-tier medallion and its bold name (with a "This week" pip on a weekly one); screen readers
 * hear "Guild title: Bloodletter (most honorable kills)", so the colour is never the only signal.
 */
export default function GuildTitleBadge({ title, size }: GuildTitleBadgeProps) {
  const style = GUILD_TITLE_TIER_STYLES[title.tier];
  return (
    <span className={clsx(size === "inline" ? [TITLE_PILL, style.tint] : "inline-flex max-w-full items-center gap-2.5")}>
      <GuildTitleMedallion icon={title.icon} tier={title.tier} size={size} />
      <span className={clsx("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-bold leading-tight", style.name, size === "card" ? "text-base" : "text-xs")}>
        <span className="sr-only">Guild title: </span>
        {title.weekly ? <span className={TITLE_PIP}>{GUILD_TITLE_COPY.weekly}</span> : null}
        <span>{title.title}</span>
        <span className="sr-only"> ({title.earnedFor})</span>
      </span>
    </span>
  );
}
