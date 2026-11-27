import { Compass, Download } from "lucide-react";
import { Button } from "@platform/ui";
import { downloadExplorerAddon } from "@/games/wow-forever/lib/explorerAddon/downloadExplorerAddon";

/** "Explorer" challenge help: the MGA Explorer addon download, what it does and how to install it. Folded away until opened. */
export default function ExplorerAddonCard() {
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm" data-testid="explorer-addon">
      <summary className="min-h-[44px] flex items-center gap-2 cursor-pointer font-medium">
        <Compass size={18} className="text-primary shrink-0" aria-hidden />
        Explorer addon: what Explore Azeroth still needs, and an arrow to it
      </summary>
      <div className="space-y-3 pt-2">
        <p>
          The Explorer challenge asks for a character with Explore Azeroth: every area of every zone in Eastern Kingdoms and Kalimdor. The MGA Explorer
          addon lists in game what this character still has to find.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Each zone with how many of its areas you have explored, the zone you are in first. Click a zone to see the areas left.</li>
          <li>
            <strong>Next unexplored</strong> points an arrow at the nearest area still to find. When you discover it, the arrow moves on to the next one.
          </li>
          <li>
            The World Map shows where to go: on a zone, a pin and a box on every area you still have to discover; on a continent, how many areas each zone
            has left. Click a pin to be guided there.
          </li>
          <li>Progress comes from your achievements. Where the game won&apos;t share them, it reads the map you have uncovered instead.</li>
        </ul>
        <p className="text-muted-foreground">
          The arrow is MGA Waypoints&apos; arrow, so the download has both addons. Distances are straight lines.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have{" "}
            <code>AddOns\MGAExplorer</code> and <code>AddOns\MGAWaypoints</code> folders.
          </li>
          <li>Restart the game.</li>
          <li>
            Click the MGA minimap button and choose <strong>Explorer</strong>, or type <code>/mgaexplore</code>.
          </li>
        </ol>
        <Button onClick={downloadExplorerAddon} data-testid="explorer-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </Button>
      </div>
    </details>
  );
}
