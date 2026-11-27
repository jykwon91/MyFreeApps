import { Download, Skull } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { useDownloadDropsAddon } from "@/games/wow-forever/hooks/useDownloadDropsAddon";

/** "What does this mob drop?": the MGA Drops addon download, what it does and how to install it. Folded away until opened. */
export default function DropsAddonCard() {
  const { download, downloading } = useDownloadDropsAddon();
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm" data-testid="drops-addon">
      <summary className="min-h-[44px] flex items-center gap-2 cursor-pointer font-medium">
        <Skull size={18} className="text-primary shrink-0" aria-hidden />
        Drops addon: what a mob drops and how often, in its tooltip
      </summary>
      <div className="space-y-3 pt-2">
        <p>The MGA Drops addon adds a creature&apos;s drops to its tooltip in WoW Forever when you mouse over it or target it.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>The likeliest drops with their chances, in the item&apos;s quality colour. Hold Shift for every drop.</li>
          <li>Quest items are marked, drops only one faction gets are left out for the other, and random world drops show as one line.</li>
          <li>
            <code>/mgadrops</code> opens your target&apos;s full list; <code>/mgadrops &lt;name&gt;</code> looks any creature up by name.
          </li>
        </ul>
        <p className="text-muted-foreground">
          The chances are Classic&apos;s, worked out from the cmangos classic-db loot tables, and WoW Forever may differ. A creature Classic
          doesn&apos;t have says &quot;no drop data&quot;.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have{" "}
            <code>AddOns\MGADrops</code> and <code>AddOns\MGAHub</code> folders (MGA Hub is the minimap button and settings every MGA addon shares).
          </li>
          <li>Restart the game.</li>
          <li>
            Mouse over a creature, or click the MGA minimap button and choose <strong>Mob drops</strong>.
          </li>
        </ol>
        <LoadingButton onClick={download} isLoading={downloading} loadingText="Packing drops..." data-testid="drops-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </LoadingButton>
      </div>
    </details>
  );
}
