import { Download } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { useDownloadPricesAddon } from "@/games/wow-forever/hooks/useDownloadPricesAddon";

/** "Get these prices in your game": the MGA Prices addon download and how to install it. Folded away until opened. */
export default function PricesAddonCard() {
  const { download, downloading } = useDownloadPricesAddon();
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm" data-testid="prices-addon">
      <summary className="min-h-[44px] flex items-center cursor-pointer font-medium">Get these prices in your game tooltips</summary>
      <div className="space-y-3 pt-2">
        <p>
          The MGA Prices addon shows an item&apos;s auction price when you mouse over it in WoW Forever: your faction&apos;s house,
          or every house while you hold Shift. It also tells you what to do with the item: disenchant it, sell it on the auction
          house, or vendor it — whichever nets the most. For bind-on-pickup gear you can&apos;t sell, it compares disenchanting
          against vendoring directly. On crafting materials it shows which profession leveling routes use them and the best craft
          that pays with them on your house: the demand that can push a price up. It also names what a material is wanted for:
          the most valuable thing it goes into on your house, which can hold its price up even when no craft pays. In chat, each
          item link gets its price written after it, and hovering a link shows its tooltip (<code>/mgaprices chat</code> turns the
          prices in chat off or on).
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon. It comes with today&apos;s prices for every house.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have{" "}
            <code>AddOns\MGAPrices</code> and <code>AddOns\MGAHub</code> folders (MGA Hub is the minimap button and settings every MGA addon shares).
          </li>
          <li>Restart the game (a new addon folder needs it; <code>/reload</code> is not enough).</li>
        </ol>
        <p className="text-muted-foreground">
          The addon can&apos;t go online, so it keeps the prices from your download. Download again to refresh them;{" "}
          <code>/mgaprices</code> in game says how old yours are.
        </p>
        <LoadingButton onClick={download} isLoading={downloading} loadingText="Packing prices..." data-testid="prices-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </LoadingButton>
      </div>
    </details>
  );
}
