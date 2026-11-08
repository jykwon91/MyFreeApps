import { Link, useParams } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import RaceCard from "@/games/wow-forever/components/races/RaceCard";
import RacesList from "@/games/wow-forever/components/races/RacesList";
import RacesNote from "@/games/wow-forever/components/races/RacesNote";
import RacesSkeleton from "@/games/wow-forever/components/races/RacesSkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { RACES_PAGE_PATH, RACES_STATUS, RACES_TEXT } from "@/games/wow-forever/data/races/racesConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useRaces } from "@/games/wow-forever/hooks/useRaces";
import { useScrollToHash } from "@/games/wow-forever/hooks/useScrollToHash";

const BACK_LINK = "inline-flex min-h-[44px] items-center text-sm underline underline-offset-2";

/** /wow-forever/races and /wow-forever/races/:race — every race's faction, start, classes and racials, vs Classic. */
export default function WowRacesPage() {
  useDocumentTitle("Races · WoW Forever");
  const { race: slug } = useParams<{ race: string }>();
  const state = useRaces();
  const ready = state.status === RACES_STATUS.ready;
  useScrollToHash(ready);
  const race = ready && slug ? (state.data.races.find((r) => r.slug === slug) ?? null) : null;

  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title={race ? `Races: ${race.name}` : "Races"}
        subtitle="Each race's faction, starting zone, classes and racial traits, and what Forever changed from Classic."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <RacesNote />
      {state.status === RACES_STATUS.error ? (
        <LoadErrorRetry message="Couldn't load the races." onRetry={state.retry} retrying={false} />
      ) : null}
      {state.status === RACES_STATUS.loading ? <RacesSkeleton filters={!slug} /> : null}
      {ready && !slug ? <RacesList races={state.data.races} /> : null}
      {ready && slug ? (
        <div className="space-y-3">
          <Link to={RACES_PAGE_PATH} className={BACK_LINK}>
            {RACES_TEXT.allRaces}
          </Link>
          {race ? (
            <ul>
              <RaceCard race={race} linkName={false} />
            </ul>
          ) : (
            <p className="rounded-xl border bg-card p-4 text-sm" data-testid="races-unknown">
              {RACES_TEXT.unknownRace}
            </p>
          )}
        </div>
      ) : null}
    </main>
  );
}
