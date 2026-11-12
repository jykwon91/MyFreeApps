import { useId, useState } from "react";
import GuildTitleBadge from "@/games/wow-forever/components/guild/GuildTitleBadge";
import { GUILD_TITLE_COPY, GUILD_TITLE_SHOWN } from "@/games/wow-forever/data/guild/guildTitles";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildMemberTitlesProps {
  /** The member's titles, most notable first; undefined or empty for none. */
  titles: readonly GuildTitle[] | undefined;
}

/** A member's guild titles by their name: the first, and "+N" to show the rest. */
export default function GuildMemberTitles({ titles }: GuildMemberTitlesProps) {
  const [open, setOpen] = useState(false);
  const moreId = useId();
  if (!titles || titles.length === 0) return null;
  const more = titles.slice(GUILD_TITLE_SHOWN);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {titles.slice(0, GUILD_TITLE_SHOWN).map((title) => (
        <GuildTitleBadge key={title.boardId} title={title} />
      ))}
      <span id={moreId} hidden={!open} className={open ? "contents" : undefined}>
        {more.map((title) => (
          <GuildTitleBadge key={title.boardId} title={title} />
        ))}
      </span>
      {more.length > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={moreId}
          aria-label={open ? GUILD_TITLE_COPY.showFewer : GUILD_TITLE_COPY.showMore(more.length)}
          onClick={() => setOpen((was) => !was)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? "Less" : `+${more.length}`}
        </button>
      ) : null}
    </span>
  );
}
