import { Download, Swords } from "lucide-react";
import { Button } from "@platform/ui";
import { downloadPvPLogAddon } from "@/games/wow-forever/lib/pvpLogAddon/downloadPvPLogAddon";

/** "Who keeps killing me?": the MGA PvP Log addon download, what it records and how to install it. Folded away until opened. */
export default function PvPLogAddonCard() {
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm" data-testid="pvplog-addon">
      <summary className="min-h-[44px] flex items-center gap-2 cursor-pointer font-medium">
        <Swords size={18} className="text-primary shrink-0" aria-hidden />
        PvP log addon: who killed you, and who you killed
      </summary>
      <div className="space-y-3 pt-2">
        <p>
          The MGA PvP Log addon keeps a list of the enemy-faction players who fought or killed you, and the ones you killed: their name,
          race, class, level and guild when the game has shown them to it, where it happened, when, and the spell. When one kills you it
          prints a single chat line naming them. Open the list from the MGA menu or with <code>/mgapvp</code>; the last 200 encounters
          are kept for each character. It can also keep a kill-on-sight list: whoever kills you is added, and when a tracked player shows
          up near you (in combat, on a nameplate, as your target or mouseover, or as a groupmate's target) it warns you with a chat line,
          a sound and a banner, and remembers where you were when you saw them. The game never tells an addon where an enemy player is,
          so that is where you were, not their exact spot.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have an{" "}
            <code>AddOns\MGAPvPLog</code> folder.
          </li>
          <li>
            Restart the game completely (a new addon or file needs it; <code>/reload</code> is not enough).
          </li>
          <li>
            Turn the chat line off or on in the MGA settings (right-click the MGA minimap button), or with <code>/mgapvp chat</code>.
          </li>
        </ol>
        <Button onClick={downloadPvPLogAddon} data-testid="pvplog-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </Button>
      </div>
    </details>
  );
}
