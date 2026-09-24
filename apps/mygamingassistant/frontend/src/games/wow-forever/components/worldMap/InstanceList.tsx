import { useState } from "react";
import clsx from "clsx";
import InstanceLevel from "@/games/wow-forever/components/worldMap/InstanceLevel";
import PoiRow from "@/games/wow-forever/components/worldMap/PoiRow";
import { INSTANCE_KIND, type PlayerFaction, type WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { Directions } from "@/games/wow-forever/worldMap/directions";
import { instanceBand, LEVEL_BAND } from "@/games/wow-forever/worldMap/levels";
import type { RankedPoi } from "@/games/wow-forever/worldMap/nearest";

const PAGE_SIZE = 4;

interface InstanceListProps {
  data: WorldMapData;
  faction: PlayerFaction;
  level: number | null;
  instances: readonly RankedPoi[];
  selectedPoiId: string | null;
  onToggle: (poiId: string) => void;
  directions: Directions | null | undefined;
}

/** Dungeon and raid entrances, nearest first; ones too low for you are dimmed. */
export default function InstanceList(props: InstanceListProps) {
  const { data, faction, level, instances, selectedPoiId, onToggle, directions } = props;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = instances.slice(0, limit);

  return (
    <section aria-labelledby="wm-instances" className="space-y-3">
      <h2 id="wm-instances" className="text-lg font-semibold">
        Dungeons &amp; raids
      </h2>
      <p className="text-sm text-muted-foreground">
        Levels are Forever's own. Entrances are from Classic — Forever's new dungeons aren't mapped yet.
      </p>
      <div className="space-y-3">
        {shown.map((ranked) => (
          <div
            key={ranked.poi.id}
            className={clsx(level !== null && instanceBand(ranked.poi, level) === LEVEL_BAND.grey && "opacity-60")}
          >
            <PoiRow
              ranked={ranked}
              data={data}
              faction={faction}
              heading={ranked.poi.subkind === INSTANCE_KIND.raid ? "Raid" : "Dungeon"}
              selected={ranked.poi.id === selectedPoiId}
              onToggle={onToggle}
              directions={directions}
            >
              <InstanceLevel poi={ranked.poi} level={level} />
            </PoiRow>
          </div>
        ))}
      </div>
      {instances.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="rounded-md border px-4 text-sm min-h-[44px] hover:bg-muted/40"
        >
          Show more dungeons
        </button>
      )}
    </section>
  );
}
