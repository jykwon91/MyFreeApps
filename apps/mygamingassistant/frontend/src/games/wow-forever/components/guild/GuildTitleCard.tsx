import clsx from "clsx";
import { Fragment } from "react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import GuildTitleBadge from "@/games/wow-forever/components/guild/GuildTitleBadge";
import { TITLE_CARD } from "@/games/wow-forever/data/guild/guildStyles";
import { GUILD_TITLE_TIER_STYLES } from "@/games/wow-forever/data/guild/titleTiers";
import { challengerLine } from "@/games/wow-forever/lib/guild/guildChase";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildTitleCardProps {
  title: GuildTitle;
}

/** One title in the Hall of Titles: the medallion and its rarity, a line of flavour, what it's for and the number, who holds it, and who's closest behind. */
export default function GuildTitleCard({ title }: GuildTitleCardProps) {
  const style = GUILD_TITLE_TIER_STYLES[title.tier];
  return (
    <li className={clsx(TITLE_CARD, style.tint)}>
      <div className="flex items-start justify-between gap-2">
        <GuildTitleBadge title={title} size="card" />
        <span className={clsx("shrink-0 text-xs font-semibold uppercase tracking-wide", style.name)}>{style.label}</span>
      </div>
      <p className="text-sm italic text-muted-foreground">{title.flavor}</p>
      <p className="text-xs text-muted-foreground">
        {title.earnedFor} · {title.display}
      </p>
      <p className="flex flex-wrap items-center gap-x-1 text-sm">
        {title.holders.map((holder, i) => (
          <Fragment key={holder.slug}>
            {i > 0 ? <span aria-hidden>,</span> : null}
            <GuildMemberLink member={holder} />
          </Fragment>
        ))}
      </p>
      {title.challenger ? <p className="text-xs text-muted-foreground">{challengerLine(title.boardId, title.challenger)}</p> : null}
    </li>
  );
}
