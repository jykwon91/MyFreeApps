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
          or every house while you hold Shift. It also says whether to sell the item on the auction house or vendor it: what
          your house pays after its cut against what a vendor pays. On crafting materials it shows which profession leveling routes use them
          and the best craft that pays with them on your house: the demand that can push a price up. In chat, each item link
          gets its price written after it, and hovering a link shows its tooltip (<code>/mgaprices chat</code> turns the
          prices in chat off or on).
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon. It comes with today&apos;s prices for every house.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have an{" "}
            <code>AddOns\MGAPrices</code> folder.
          </li>
          <li>
            Restart the game, or type <code>/reload</code>.
          </li>
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
