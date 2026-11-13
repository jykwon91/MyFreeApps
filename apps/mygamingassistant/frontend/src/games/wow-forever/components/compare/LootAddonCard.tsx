import { Download } from "lucide-react";
import { Button, showSuccess } from "@platform/ui";
import { LOOT_ADDON_ZIP_NAME } from "@/games/wow-forever/data/lootAddon/lootAddonFiles";
import { lootAddonZip } from "@/games/wow-forever/lib/lootAddon/lootAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

function download() {
  downloadZip(lootAddonZip(), LOOT_ADDON_ZIP_NAME);
  showSuccess("MGA Loot is downloading. Unzip it into your AddOns folder.");
}

/** "Know if an item is an upgrade": the MGA Loot addon download and how to install it. Folded away until opened. */
export default function LootAddonCard() {
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm" data-testid="loot-addon">
      <summary className="min-h-[44px] flex items-center cursor-pointer font-medium">Know in game if an item is an upgrade</summary>
      <div className="space-y-3 pt-2">
        <p>
          The MGA Loot addon scores items with the same weights as this page: an upgrade or downgrade by how much over the item
          you wear, about the same, or that your class can&apos;t use it. It writes the verdict beside each loot roll window and
          on the tooltip of any item you hover, in your bags, bank, a vendor or a chat link. Below level 60 it uses your
          class&apos;s leveling weights; at 60, your spec&apos;s, read from your talents. It never rolls for you.
        </p>
        <p className="text-muted-foreground">
          The game doesn&apos;t give addons an item&apos;s Equip and Use effects (hit, crit and the like) as numbers, so it
          can&apos;t score them. It says when an item has them: read the tooltip for those. Trinkets get no score.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have an{" "}
            <code>AddOns\MGALoot</code> folder.
          </li>
          <li>
            Restart the game, or type <code>/reload</code>.
          </li>
          <li>
            If the spec it picks is wrong, set yours: <code>/mgaloot spec holy</code> (<code>/mgaloot spec</code> lists them).{" "}
            <code>/mgaloot check</code> and an item link shows the verdict for any item.
          </li>
          <li>
            <code>/mgaloot bags</code> lists the upgrades in your bags, biggest first. <code>/mgaloot tooltip off</code> takes the
            verdict off tooltips.
          </li>
        </ol>
        <Button onClick={download} data-testid="loot-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </Button>
      </div>
    </details>
  );
}
