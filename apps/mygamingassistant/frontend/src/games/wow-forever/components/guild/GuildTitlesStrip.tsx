import { useId } from "react";
import GuildTitleCard from "@/games/wow-forever/components/guild/GuildTitleCard";
import { GUILD_TITLE_COPY } from "@/games/wow-forever/data/guild/guildTitles";
import type { GuildTitles } from "@/games/wow-forever/types/guild/guildTitles";

interface GuildTitlesStripProps {
  titles: GuildTitles;
}

/** Every guild title and who holds it, and any skipped for a big tie. */
export default function GuildTitlesStrip({ titles }: GuildTitlesStripProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
      <div>
        <h2 id={headingId} className="text-lg font-semibold">
          {GUILD_TITLE_COPY.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{GUILD_TITLE_COPY.note}</p>
      </div>
      {titles.awarded.length === 0 ? (
        <p className="text-sm">{GUILD_TITLE_COPY.empty}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Titles and who holds them">
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
    </section>
  );
}
