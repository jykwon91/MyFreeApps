import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import DungeonDoorRow from "@/games/wow-forever/components/dungeons/DungeonDoorRow";
import { DETAIL_LINK, DETAIL_SECTION, FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { worldMapZoneHref } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import { formatYards } from "@/games/wow-forever/worldMap/geometry";

/**
 * "Where is it?": per zone, the area, the World Map link, the nearest flight path
 * for each faction, then each door with directions and the bosses behind it.
 */
export default function DungeonLocation({ dungeon }: { dungeon: Dungeon }) {
  return (
    <section aria-labelledby="dungeon-where" className={DETAIL_SECTION}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="dungeon-where" className="font-semibold">
          Where it is
        </h2>
        <ProvenanceBadge provenance={PROVENANCE.classic} />
      </div>
      <ul className="space-y-4">
        {dungeon.entrances.map((zone) => (
          <li key={zone.zoneId} className="space-y-2" data-testid="dungeon-entrance">
            <div>
              <p className="text-sm">
                <span className="font-medium">{zone.zoneName}</span>
                {zone.subzone ? <span className="text-muted-foreground"> · {zone.subzone}</span> : null}
              </p>
              <Link to={worldMapZoneHref(zone.zoneId)} className={DETAIL_LINK}>
                <MapPin className="h-4 w-4" aria-hidden />
                Show entrance on the World Map
              </Link>
            </div>
            {zone.flightPaths.length > 0 ? (
              <div className="space-y-1" data-testid="dungeon-flight-paths">
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  Nearest flight path, as the crow flies <ProvenanceBadge provenance={PROVENANCE.client} />
                </p>
                <ul className="text-sm">
                  {zone.flightPaths.map((fp) => (
                    <li key={fp.faction}>
                      <span className="text-muted-foreground">{FACTION_NAME[fp.faction]}:</span> {fp.name}{" "}
                      <span className="text-muted-foreground">({formatYards(fp.yards)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="space-y-2">
              {zone.doors.map((door) => (
                <DungeonDoorRow
                  key={door.trigger}
                  door={door}
                  zoneId={zone.zoneId}
                  dungeonName={dungeon.name}
                  interior={dungeon.interior}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
