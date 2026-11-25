import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { describeAmount, describeWay } from "@/games/wow-forever/food/restoreText";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";
import type { RestoreOption } from "@/games/wow-forever/types/restoreOption";
import type { RestoreTrack } from "@/games/wow-forever/types/restoreTrack";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface RestoreOptionRowProps {
  option: RestoreOption;
  track: RestoreTrack;
  faction: PlayerFaction;
  sources: ItemSources;
  /** Auction house price in copper; undefined = not listed, null = prices not loaded. */
  auctionCopper: number | undefined | null;
}

/** One option: the item, what it restores, how to get it, and its auction price when we have one. */
export default function RestoreOptionRow({ option, track, faction, sources, auctionCopper }: RestoreOptionRowProps) {
  return (
    <li className="rounded-lg border bg-card p-3 space-y-1" data-testid="restore-option">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">
          <ItemNameLink itemId={option.id} name={option.name} withIcon />
        </span>
        <span className="text-sm text-muted-foreground">{describeAmount(option, track)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Level {option.level} · {describeWay(option, sources, faction)}
      </p>
      {auctionCopper === null || option.way === "mage" ? null : (
        <p className="text-xs text-muted-foreground tabular-nums">
          Auction house {auctionCopper === undefined ? <NoAuctionPrice /> : formatCost(auctionCopper)}
        </p>
      )}
    </li>
  );
}
