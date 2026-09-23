import CopyButton from "@/games/wow-forever/components/worldMap/CopyButton";
import { mgaWayCommand, wayCommand, type WaypointTarget } from "@/games/wow-forever/worldMap/waypoints";

interface WaypointButtonsProps {
  target: WaypointTarget;
}

/** "Copy in-game waypoint" (MGA Companion addon) + a plain `/way` for other coordinate addons. */
export default function WaypointButtons({ target }: WaypointButtonsProps) {
  const mga = mgaWayCommand(target);
  const way = wayCommand(target);
  return (
    <span className="flex flex-wrap gap-2">
      <CopyButton text={mga} label="Copy in-game waypoint" title={`${mga} — needs the MGA Companion addon`} />
      <CopyButton text={way} label="Copy /way" title={`${way} — for TomTom-style addons`} />
    </span>
  );
}
