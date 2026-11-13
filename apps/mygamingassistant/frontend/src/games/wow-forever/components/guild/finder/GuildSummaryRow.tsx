import { Link } from "react-router-dom";
import { FACTION_LABELS } from "@/games/wow-forever/data/character/characterConfig";
import { GUILD_PAGE_PATH } from "@/games/wow-forever/data/guild/guildConfig";
import { guildMemberCount } from "@/games/wow-forever/lib/guild/guildFinder";

interface GuildSummaryRowProps {
  slug: string;
  name: string;
  /** alliance / horde */
  faction: string;
  /** Null when unknown: nothing is shown. */
  memberCount: number | null;
}

/** One guild as a link to its page: its name, faction and size. */
export default function GuildSummaryRow({ slug, name, faction, memberCount }: GuildSummaryRowProps) {
  const members = guildMemberCount(memberCount);
  return (
    <Link
      to={`${GUILD_PAGE_PATH}/${slug}`}
      className="flex min-h-[56px] items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{`<${name}>`}</span>
        <span className="block text-xs text-muted-foreground">{FACTION_LABELS[faction] ?? faction}</span>
      </span>
      {members ? <span className="shrink-0 text-sm text-muted-foreground">{members}</span> : null}
    </Link>
  );
}
