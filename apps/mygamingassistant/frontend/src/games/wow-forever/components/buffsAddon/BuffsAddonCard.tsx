import { BellRing, Download } from "lucide-react";
import { Button, showSuccess } from "@platform/ui";
import { BUFFS_ADDON_CHECKS } from "@/games/wow-forever/data/buffsAddon/buffsAddonChecks";
import { BUFFS_ADDON_ZIP_NAME } from "@/games/wow-forever/data/buffsAddon/buffsAddonFiles";
import { buffsAddonZip } from "@/games/wow-forever/lib/buffsAddon/buffsAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

function download() {
  downloadZip(buffsAddonZip(), BUFFS_ADDON_ZIP_NAME);
  showSuccess("MGA Buffs is downloading. Unzip it into your AddOns folder.");
}

/** "Never forget a buff": the MGA Buffs addon download, what it watches and how to install it. Folded away until opened. */
export default function BuffsAddonCard() {
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm" data-testid="buffs-addon">
      <summary className="min-h-[44px] flex items-center gap-2 cursor-pointer font-medium">
        <BellRing size={18} className="text-primary shrink-0" aria-hidden />
        Buff reminder addon: armor, Soulstone, food and group buffs
      </summary>
      <div className="space-y-3 pt-2">
        <p>
          The MGA Buffs addon shows a small list with icons when a buff you want is missing or has less than 3 minutes left. A
          new reminder also flashes mid-screen with a sound. It hides in combat and while you&apos;re dead, so it only speaks
          when you can do something about it.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="What it reminds you about">
          {BUFFS_ADDON_CHECKS.map((check) => (
            <li key={check.id} className="flex gap-2 rounded-md border border-border p-2">
              <check.icon size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-medium">{check.title}.</span> {check.text}
              </span>
            </li>
          ))}
        </ul>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have an{" "}
            <code>AddOns\MGABuffs</code> folder.
          </li>
          <li>
            Restart the game, or type <code>/reload</code>.
          </li>
          <li>
            <code>/mgabuffs</code> lists what&apos;s missing. <code>/mgabuffs food</code> (or <code>armor</code>,{" "}
            <code>soulstone</code>, <code>group</code>) turns one off or on, and <code>/mgabuffs minutes 5</code> warns earlier.
          </li>
          <li>
            <code>/mgabuffs unlock</code> lets you drag the list, <code>/mgabuffs lock</code> fixes it in place.
          </li>
        </ol>
        <Button onClick={download} data-testid="buffs-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </Button>
      </div>
    </details>
  );
}
