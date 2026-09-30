import { Search } from "lucide-react";
import DestinationCard from "@/games/wow-forever/components/worldMap/DestinationCard";
import DirectionsForm from "@/games/wow-forever/components/worldMap/DirectionsForm";
import EndpointField from "@/games/wow-forever/components/worldMap/EndpointField";
import { PLANNER_SEARCH_ID } from "@/games/wow-forever/components/worldMap/plannerIds";
import type { TravelSettingsState } from "@/games/wow-forever/hooks/useTravelSettings";
import type { TripPlanner } from "@/games/wow-forever/hooks/useTripPlanner";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { Place } from "@/games/wow-forever/worldMap/places";
import type { SearchContext } from "@/games/wow-forever/worldMap/search";

interface RoutePlannerProps {
  planner: TripPlanner;
  data: WorldMapData;
  places: readonly Place[];
  context: SearchContext;
  faction: PlayerFaction;
  travel: TravelSettingsState;
  /** The saved zone, for bare coordinates. */
  currentZoneId: number | null;
  onShowMap: () => void;
}

/**
 * Search, then directions — like a maps app: find a place or NPC, see its
 * card, press Directions, and change where you start from if you like.
 */
export default function RoutePlanner({ planner, data, places, context, faction, travel, currentZoneId, onShowMap }: RoutePlannerProps) {
  const { to } = planner;
  const fieldProps = { data, places, context, currentZoneId };

  return (
    <section aria-label="Route planner" className="max-w-2xl space-y-3 scroll-mt-4">
      {!to && (
        <EndpointField
          id={PLANNER_SEARCH_ID}
          label="Find an NPC or place"
          placeholder='Try "Ryback", "Goldshire" or "cooking trainer stormwind"'
          initialText=""
          {...fieldProps}
          onChoose={planner.setTo}
          icon={<Search className="h-4 w-4" aria-hidden />}
        />
      )}
      {to && !planner.directionsOpen && (
        <DestinationCard
          destination={to}
          onDirections={planner.openDirections}
          onClear={planner.clear}
          onShowMap={onShowMap}
        />
      )}
      {to && planner.directionsOpen && (
        <DirectionsForm
          {...fieldProps}
          faction={faction}
          travel={travel}
          from={planner.from}
          fromKey={planner.fromKey}
          fromIsMe={planner.fromIsMe}
          to={to}
          toKey={planner.toKey}
          myLocationLabel={planner.myLocationLabel}
          directions={planner.directions}
          onSetFrom={planner.setFrom}
          onSetTo={planner.setTo}
          onSwap={planner.swap}
          onChooseOnMap={planner.chooseOnMap}
          onSetAsMyLocation={planner.setAsMyLocation}
          onClose={planner.closeDirections}
          onShowMap={onShowMap}
        />
      )}
    </section>
  );
}
