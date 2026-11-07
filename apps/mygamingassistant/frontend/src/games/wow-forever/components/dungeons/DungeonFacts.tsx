import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { DETAIL_LINK, DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { entranceDoorsText } from "@/games/wow-forever/lib/dungeons/describeDungeon";
import { worldMapZoneHref } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import { instanceLevelText } from "@/games/wow-forever/worldMap/levels";

/** The dungeon's level and where its doors are, each with a link to that zone on the World Map. */
export default function DungeonFacts({ dungeon }: { dungeon: Dungeon }) {
  return (
    <section aria-label="Level and entrance" className={DETAIL_SECTION}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{instanceLevelText(dungeon)}</h2>
          <ProvenanceBadge provenance={PROVENANCE.client} />
        </div>
        <p className="text-sm text-muted-foreground">You can go in from level {dungeon.requiredLevel}.</p>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{dungeon.entrances.length === 1 ? "Entrance" : "Entrances"}</h2>
          <ProvenanceBadge provenance={PROVENANCE.classic} />
        </div>
        <ul className="space-y-2">
          {dungeon.entrances.map((zone) => {
            const doors = entranceDoorsText(zone);
            return (
              <li key={zone.zoneId} className="text-sm" data-testid="dungeon-entrance">
                <p>
                  <span className="font-medium">{zone.zoneName}</span>
                  {zone.subzone ? <span className="text-muted-foreground"> · {zone.subzone}</span> : null}
                </p>
                {doors ? <p className="text-muted-foreground">{doors}</p> : null}
                <Link to={worldMapZoneHref(zone.zoneId)} className={DETAIL_LINK}>
                  <MapPin className="h-4 w-4" aria-hidden />
                  Show entrance on the World Map
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
