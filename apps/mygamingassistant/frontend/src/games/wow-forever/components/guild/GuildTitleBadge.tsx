import clsx from "clsx";
import { GUILD_TITLE_COPY } from "@/games/wow-forever/data/guild/guildTitles";
import {
  GUILD_TITLE_BADGE,
  GUILD_TITLE_BADGE_ALL_TIME,
  GUILD_TITLE_BADGE_WEEKLY,
} from "@/games/wow-forever/data/guild/guildStyles";
import { GOLD_BORDER } from "@/games/wow-forever/data/guild/medalStyles";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildTitleBadgeProps {
  title: GuildTitle;
}

/** A guild title as an icon and its name; screen readers hear "Guild title: Bloodletter (most honorable kills)". */
export default function GuildTitleBadge({ title }: GuildTitleBadgeProps) {
  const Icon = title.icon;
  return (
    <span className={clsx(GUILD_TITLE_BADGE, title.weekly ? GUILD_TITLE_BADGE_WEEKLY : [GUILD_TITLE_BADGE_ALL_TIME, GOLD_BORDER])}>
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only">Guild title: </span>
      {title.weekly ? <span className="font-normal">{GUILD_TITLE_COPY.weekly}:</span> : null}
      <span>{title.title}</span>
      <span className="sr-only"> ({title.earnedFor})</span>
    </span>
  );
}
