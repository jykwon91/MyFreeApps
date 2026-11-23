import { BookOpen, Download } from "lucide-react";
import { Button } from "@platform/ui";
import { downloadProfessionsAddon } from "@/games/wow-forever/lib/professionsAddon/downloadProfessionsAddon";

/** "Take the guides into the game": the MGA Professions addon download, what it does and how to install it. Folded away until opened. */
export default function ProfessionsAddonCard() {
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm" data-testid="professions-addon">
      <summary className="min-h-[44px] flex items-center gap-2 cursor-pointer font-medium">
        <BookOpen size={18} className="text-primary shrink-0" aria-hidden />
        Professions addon: these guides in your game
      </summary>
      <div className="space-y-3 pt-2">
        <p>
          The MGA Professions addon shows these guides in a window in game. It starts from your own professions and your current skill, so you see
          the next rows of the route, not all 300 points.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Each row says how many to craft, the mats it takes and how many of them you carry, and where to learn the recipe.</li>
          <li>The trainers for your next rank, with the level it needs. Click one to point the MGA Waypoints arrow at them.</li>
          <li>For gathering, the best zones for your skill. With MGA Prices installed it adds what the mats cost.</li>
        </ul>
        <p className="text-muted-foreground">
          Skills, levels and trainers are Classic data and may differ in Forever. Open your profession window once so the addon can see which recipes you know.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have an{" "}
            <code>AddOns\MGAProfessions</code> folder.
          </li>
          <li>Restart the game.</li>
          <li>
            Open it from the MGA minimap menu (<strong>Professions</strong>), the key binding, or the <strong>MGA guide</strong> button on a profession window.
          </li>
        </ol>
        <Button onClick={downloadProfessionsAddon} data-testid="professions-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </Button>
      </div>
    </details>
  );
}
