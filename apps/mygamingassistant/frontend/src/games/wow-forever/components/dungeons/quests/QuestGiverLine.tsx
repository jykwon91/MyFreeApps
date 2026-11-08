import { MapPin, Navigation } from "lucide-react";
import { Link } from "react-router-dom";
import InsideDungeonChip from "@/games/wow-forever/components/dungeons/quests/InsideDungeonChip";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { directionsHref } from "@/games/wow-forever/food/recipeSources";
import { questGiverMapHref } from "@/games/wow-forever/lib/dungeons/questGiverMapHref";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import { QUEST_TARGET_KIND } from "@/games/wow-forever/types/dungeons/questTargetKind";
import { formatMapCoords } from "@/games/wow-forever/worldMap/routeDistance";

/** One quest giver: its name, and where it stands — out in the world (World Map link + directions) or inside. */
export default function QuestGiverLine({ giver }: { giver: QuestGiver }) {
  const { place } = giver;
  return (
    <li className="space-y-0.5" data-testid="quest-giver">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{giver.name}</span>
        {giver.kind === QUEST_TARGET_KIND.item ? <span className="text-muted-foreground">(an item that starts the quest)</span> : null}
        {giver.insideDungeon ? <InsideDungeonChip /> : null}
        {place ? (
          <span className="text-muted-foreground">
            {[place.zoneName, place.subzone].filter(Boolean).join(" · ")} · {formatMapCoords(place.x, place.y)}
          </span>
        ) : null}
      </p>
      {place ? (
        <div className="flex flex-wrap gap-x-4">
          <Link to={questGiverMapHref(giver.name, place)} className={DETAIL_LINK} data-testid="quest-giver-map-link">
            <MapPin className="h-4 w-4" aria-hidden />
            Show {giver.name} on the World Map
          </Link>
          <Link to={directionsHref({ zoneId: place.zoneId, x: place.x, y: place.y })} className={DETAIL_LINK}>
            <Navigation className="h-4 w-4" aria-hidden />
            Directions
            <span className="sr-only"> to {giver.name}</span>
          </Link>
        </div>
      ) : null}
    </li>
  );
}
