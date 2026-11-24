import { Trophy } from "lucide-react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { ARCHIVED_RACES_COPY } from "@/games/wow-forever/data/guild/archivedRaces";
import { ARCHIVED_RACE_CARD } from "@/games/wow-forever/data/guild/guildStyles";
import { formatShortDay } from "@/games/wow-forever/lib/guild/formatShortDay";
import type { ArchivedRace } from "@/games/wow-forever/types/guild/archivedRace";

interface GuildArchivedRacesProps {
  races: readonly ArchivedRace[];
}

/** The Arena's trophy shelf: races the guild has finished, each with its winner (and the day, when recorded). */
export default function GuildArchivedRaces({ races }: GuildArchivedRacesProps) {
  if (races.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label={ARCHIVED_RACES_COPY.listLabel}>
      {races.map((race) => (
        <li key={race.id} className={ARCHIVED_RACE_CARD}>
          <Trophy aria-hidden className="h-6 w-6 shrink-0 text-[#F2C94C]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{race.title}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              <span>{ARCHIVED_RACES_COPY.won}</span>
              <GuildMemberLink member={race.winner} />
              <span>
                {race.achievement}
                {race.day ? ` ${ARCHIVED_RACES_COPY.on(formatShortDay(race.day))}` : ""}
              </span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
