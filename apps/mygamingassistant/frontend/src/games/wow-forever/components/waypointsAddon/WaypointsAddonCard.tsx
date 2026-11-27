import { Download, Navigation } from "lucide-react";
import { Button } from "@platform/ui";
import { downloadWaypointsAddon } from "@/games/wow-forever/lib/waypointsAddon/downloadWaypointsAddon";

/** "Get guided in game": the MGA Waypoints addon download, what it does and how to install it. Folded away until opened. */
export default function WaypointsAddonCard() {
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm" data-testid="waypoints-addon">
      <summary className="min-h-[44px] flex items-center gap-2 cursor-pointer font-medium">
        <Navigation size={18} className="text-primary shrink-0" aria-hidden />
        Waypoint arrow addon: pick a place, follow the arrow
      </summary>
      <div className="space-y-3 pt-2">
        <p>
          The MGA Waypoints addon guides you to a place without typing anything. Pick it from the MGA menu and an arrow on your screen points the way,
          showing the yards left, with a pin on your minimap and on the World Map. The arrow clears itself when you arrive.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your class trainer, the nearest flight master, a repair vendor, an innkeeper, a bank or auction house, or a profession trainer.</li>
          <li>Dungeon and raid doors, and any named place on the World Map. Or search by name.</li>
          <li>Nearest first, for your faction, on your zone, your continent or everywhere.</li>
          <li>On another continent it points at the boat or zeppelin that takes you there.</li>
        </ul>
        <p className="text-muted-foreground">
          Distances are straight lines, and places come from Classic data, so one may sit somewhere else in Forever.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have{" "}
            <code>AddOns\MGAWaypoints</code> and <code>AddOns\MGAHub</code> folders (MGA Hub is the minimap button and settings every MGA addon shares).
          </li>
          <li>Restart the game.</li>
          <li>
            Click the MGA minimap button and choose <strong>Go to...</strong>. Drag the arrow where you like; right-click it to clear.
          </li>
        </ol>
        <Button onClick={downloadWaypointsAddon} data-testid="waypoints-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </Button>
      </div>
    </details>
  );
}
