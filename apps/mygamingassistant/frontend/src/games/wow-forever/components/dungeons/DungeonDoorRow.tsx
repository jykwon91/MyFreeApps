import { Navigation } from "lucide-react";
import { Link } from "react-router-dom";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import InstanceInterior from "@/games/wow-forever/components/worldMap/InstanceInterior";
import { directionsHref } from "@/games/wow-forever/food/recipeSources";
import { doorLabel } from "@/games/wow-forever/lib/dungeons/describeDungeon";
import type { DungeonDoor } from "@/games/wow-forever/types/dungeons/dungeonDoor";
import type { Interior } from "@/games/wow-forever/worldMap/interiors";
import { formatMapCoords } from "@/games/wow-forever/worldMap/routeDistance";

interface DungeonDoorRowProps {
  door: DungeonDoor;
  zoneId: number;
  dungeonName: string;
  /** The World Map interior: its "Inside · bosses & routes" lists the bosses behind this door (the wing). */
  interior: Interior | null;
}

/** One door: its name and coordinates, walking directions on the World Map, and the bosses behind it. */
export default function DungeonDoorRow({ door, zoneId, dungeonName, interior }: DungeonDoorRowProps) {
  const label = doorLabel(door);
  return (
    <li className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0" data-testid="dungeon-door">
      <p className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground"> · {formatMapCoords(door.x, door.y)}</span>
      </p>
      <Link to={directionsHref({ zoneId, x: door.x, y: door.y })} className={DETAIL_LINK}>
        <Navigation className="h-4 w-4" aria-hidden />
        Directions to {door.wing ? `the ${label} door` : "the entrance"}
      </Link>
      {interior?.entrances.has(door.trigger) ? (
        <InstanceInterior interior={interior} trigger={door.trigger} name={dungeonName} rowId={`dungeon-door-${door.trigger}`} />
      ) : null}
    </li>
  );
}
