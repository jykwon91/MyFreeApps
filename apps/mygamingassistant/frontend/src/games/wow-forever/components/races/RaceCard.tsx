import { Link } from "react-router-dom";
import RaceClassChips from "@/games/wow-forever/components/races/RaceClassChips";
import RaceStartZoneLine from "@/games/wow-forever/components/races/RaceStartZoneLine";
import RacialRow from "@/games/wow-forever/components/races/RacialRow";
import RemovedRacials from "@/games/wow-forever/components/races/RemovedRacials";
import { RACE_FACTION_LABEL, RACES_PAGE_PATH, RACES_TEXT, RACIAL_STATUS } from "@/games/wow-forever/data/races/racesConfig";
import type { Race } from "@/games/wow-forever/types/races/race";

interface RaceCardProps {
  race: Race;
  /** The list view links the race's name to its own page; the race's own page doesn't. */
  linkName: boolean;
}

/** One race: faction, starting zone, classes, racial names as jump links, then each racial; removed ones collapsed last. */
export default function RaceCard({ race, linkName }: RaceCardProps) {
  const current = race.racials.filter((r) => r.status !== RACIAL_STATUS.removed);
  const removed = race.racials.filter((r) => r.status === RACIAL_STATUS.removed);
  return (
    <li id={race.slug} className="scroll-mt-4 space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-testid="race-card">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">
            {linkName ? (
              <Link to={`${RACES_PAGE_PATH}/${race.slug}`} className="hover:underline">
                {race.name}
              </Link>
            ) : (
              race.name
            )}
          </h2>
          <span className="text-sm text-muted-foreground" data-testid="race-faction">
            {RACE_FACTION_LABEL[race.faction]}
          </span>
          {race.newInForever ? (
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{RACES_TEXT.newRace}</span>
          ) : null}
        </div>
        {race.startZone ? <RaceStartZoneLine zone={race.startZone} /> : null}
        <RaceClassChips classes={race.classes} newClasses={race.newClasses} />
        {current.length > 0 ? (
          <nav aria-label={`${race.name} racials`} className="flex flex-wrap gap-x-3 text-sm">
            {current.map((r) => (
              <a key={r.key} href={`#${r.key}`} className="inline-flex min-h-[44px] items-center underline underline-offset-2 sm:min-h-0">
                {r.name}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
      {current.length > 0 ? (
        <ul className="space-y-3">
          {current.map((r) => (
            <RacialRow key={r.key} racial={r} />
          ))}
        </ul>
      ) : null}
      <RemovedRacials racials={removed} />
    </li>
  );
}
