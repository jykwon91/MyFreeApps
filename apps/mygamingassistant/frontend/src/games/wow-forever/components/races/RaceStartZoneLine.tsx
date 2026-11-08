import { Link } from "react-router-dom";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE_DETAIL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { RACES_TEXT } from "@/games/wow-forever/data/races/racesConfig";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { RaceStartZone } from "@/games/wow-forever/types/races/raceStartZone";

/** "Starts in Elwynn Forest" + its badge (Classic data, or Unconfirmed for a race Classic doesn't have) + a World Map link. */
export default function RaceStartZoneLine({ zone }: { zone: RaceStartZone }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="race-start-zone">
      <span>
        Starts in <span className="font-medium">{zone.name}</span>
      </span>
      {zone.basis === "classic" ? (
        <ProvenanceBadge provenance={PROVENANCE.classic} />
      ) : (
        <ProvenanceBadge provenance={PROVENANCE.unconfirmed} detail={PROVENANCE_DETAIL.newRaceStart} />
      )}
      {zone.uiMapId !== null ? (
        <Link
          to={`/wow-forever/map?m=${zone.uiMapId}`}
          className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-2 sm:min-h-0"
        >
          {RACES_TEXT.showOnMap}
        </Link>
      ) : null}
    </p>
  );
}
