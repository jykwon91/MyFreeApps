import PoiRow from "@/games/wow-forever/components/worldMap/PoiRow";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { Directions } from "@/games/wow-forever/worldMap/directions";
import type { HeroRow } from "@/games/wow-forever/worldMap/worldMapModel";

interface NearestServicesProps {
  rows: readonly HeroRow[];
  data: WorldMapData;
  faction: PlayerFaction;
  selectedPoiId: string | null;
  onToggle: (poiId: string) => void;
  onSelect: (poiId: string) => void;
  directions: Directions | null | undefined;
}

/** The hero list: the closest of each everyday service, your class trainer first. */
export default function NearestServices(props: NearestServicesProps) {
  const { rows, data, faction, selectedPoiId, onToggle, onSelect, directions } = props;
  return (
    <section aria-labelledby="wm-nearest" className="space-y-3">
      <h2 id="wm-nearest" className="text-lg font-semibold">
        Nearest services
      </h2>
      <div className="space-y-3">
        {rows.map(({ filter, best }) => {
          if (!best) {
            return (
              <p key={filter.id} className="rounded-lg border p-3 text-sm text-muted-foreground">
                {filter.label}: none found for your faction.
              </p>
            );
          }
          return (
            <PoiRow
              key={filter.id}
              heading={filter.label}
              ranked={best}
              data={data}
              faction={faction}
              selected={best.poi.id === selectedPoiId}
              onToggle={onToggle}
              onSelect={onSelect}
              directions={directions}
            />
          );
        })}
      </div>
    </section>
  );
}
