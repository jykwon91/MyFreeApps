import { Fragment } from "react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import GuildTitleBadge from "@/games/wow-forever/components/guild/GuildTitleBadge";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildTitleCardProps {
  title: GuildTitle;
}

/** One title in the titles strip: the badge, what it's for and the number, and who holds it. */
export default function GuildTitleCard({ title }: GuildTitleCardProps) {
  return (
    <li className="space-y-0.5 rounded-lg border px-3 pt-2">
      <GuildTitleBadge title={title} />
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
    </li>
  );
}
