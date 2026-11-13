import { Flame } from "lucide-react";
import { useId, useMemo } from "react";
import GuildDuelCard from "@/games/wow-forever/components/guild/GuildDuelCard";
import { HOT_RACES_COPY } from "@/games/wow-forever/data/guild/guildHallCopy";
import { HALL_HEADING, HALL_SECTION } from "@/games/wow-forever/data/guild/guildStyles";
import { hotRaces } from "@/games/wow-forever/lib/guild/guildHotRaces";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitles } from "@/games/wow-forever/types/guild/guildTitles";

interface GuildHotRacesProps {
  members: readonly GuildMember[];
  /** The awarded titles: a race names the title at stake only when that board's title was given out. */
  titles: GuildTitles;
}

/** The closest fights for first place, as duel cards; nothing at all when no board has a close race. */
export default function GuildHotRaces({ members, titles }: GuildHotRacesProps) {
  const headingId = useId();
  const races = useMemo(() => hotRaces(members), [members]);
  if (races.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className={HALL_SECTION}>
      <div>
        <h2 id={headingId} className={HALL_HEADING}>
          <Flame aria-hidden className="h-5 w-5 text-red-500" />
          {HOT_RACES_COPY.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{HOT_RACES_COPY.note}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={HOT_RACES_COPY.listLabel}>
        {races.map((race) => (
          <GuildDuelCard
            key={race.board.id}
            race={race}
            stake={titles.awarded.find((t) => t.boardId === race.board.id)?.title ?? null}
          />
        ))}
      </ul>
    </section>
  );
}
