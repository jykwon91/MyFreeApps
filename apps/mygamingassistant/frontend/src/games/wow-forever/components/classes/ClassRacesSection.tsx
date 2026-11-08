import { Link } from "react-router-dom";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { RACES_PAGE_PATH } from "@/games/wow-forever/data/races/racesConfig";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ClassRace } from "@/games/wow-forever/lib/classes/classRaces";

interface ClassRacesSectionProps {
  races: readonly ClassRace[];
}

/** Races that can be a given class — each links to the race's detail page. */
export default function ClassRacesSection({ races }: ClassRacesSectionProps) {
  if (races.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="class-races-heading" className="space-y-2" data-testid="class-races-section">
      <h2
        id="class-races-heading"
        className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Playable races
        <ProvenanceBadge provenance={PROVENANCE.client} />
      </h2>
      <ul className="flex flex-wrap gap-2" data-testid="class-races">
        {races.map((race) => (
          <li key={race.slug}>
            <Link
              to={`${RACES_PAGE_PATH}/${race.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm hover:bg-muted/40 transition-colors min-h-[36px]"
              data-testid={`class-race-${race.slug}`}
            >
              {race.name}
              {race.isNew ? (
                <span className="text-xs font-medium text-primary" data-testid="class-race-new">
                  · New in Forever
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
