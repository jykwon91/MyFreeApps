import { Trophy } from "lucide-react";
import { useId } from "react";
import GuildTitleCard from "@/games/wow-forever/components/guild/GuildTitleCard";
import { HALL_HEADING, HALL_SECTION } from "@/games/wow-forever/data/guild/guildStyles";
import { GUILD_TITLE_COPY } from "@/games/wow-forever/data/guild/guildTitles";
import type { GuildTitles } from "@/games/wow-forever/types/guild/guildTitles";

interface GuildTitlesStripProps {
  titles: GuildTitles;
}

/** The Hall of Titles: every guild title, rarest first, with its holders; any skipped for a big tie; and the footnote that they're not in-game titles. */
export default function GuildTitlesStrip({ titles }: GuildTitlesStripProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={HALL_SECTION}>
      <div>
        <h2 id={headingId} className={HALL_HEADING}>
          <Trophy aria-hidden className="h-5 w-5 text-[#ff8000]" />
          {GUILD_TITLE_COPY.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{GUILD_TITLE_COPY.tagline}</p>
      </div>
      {titles.awarded.length === 0 ? (
        <p className="text-sm">{GUILD_TITLE_COPY.empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={GUILD_TITLE_COPY.listLabel}>
          {titles.awarded.map((title) => (
            <GuildTitleCard key={title.boardId} title={title} />
          ))}
        </ul>
      )}
      {titles.skipped.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {titles.skipped.map((s) => (
            <li key={s.title}>{GUILD_TITLE_COPY.skipped(s.title, s.earnedFor)}</li>
          ))}
        </ul>
      ) : null}
      {titles.awarded.length > 0 ? <p className="text-xs text-muted-foreground">{GUILD_TITLE_COPY.note}</p> : null}
    </section>
  );
}
