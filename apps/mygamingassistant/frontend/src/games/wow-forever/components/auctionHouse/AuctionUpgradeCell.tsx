import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { VERDICT_STYLES } from "@/games/wow-forever/data/itemCompare/itemCompareStyles";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { verdictText } from "@/games/wow-forever/lib/itemCompare/verdictText";
import type { AuctionUpgrade } from "@/games/wow-forever/types/auctionHouse/auctionUpgrade";

interface AuctionUpgradeCellProps {
  upgrade: AuctionUpgrade | undefined;
}

const MOBILE_LABEL = <span className="text-xs text-muted-foreground sm:hidden">vs. equipped</span>;

/**
 * The upgrade column cell for one Auction House result row. Shows the verdict against the
 * character's equipped item in that slot, plus the equipped item's icon and name.
 * Non-gear items (consumables, materials) render an empty placeholder to maintain column alignment.
 */
export default function AuctionUpgradeCell({ upgrade }: AuctionUpgradeCellProps) {
  // No entry or not a gear slot: empty placeholder so the sm+ grid aligns correctly.
  if (!upgrade || upgrade.kind === "not-equippable") {
    return <div aria-hidden="true" />;
  }

  if (upgrade.kind === "slot-empty") {
    return (
      <div className="col-span-2 flex flex-col sm:col-span-1 sm:justify-center" data-testid="auction-upgrade-cell">
        {MOBILE_LABEL}
        <span className="text-xs text-muted-foreground">Slot empty</span>
      </div>
    );
  }

  if (upgrade.kind === "cant-use") {
    return (
      <div className="col-span-2 flex flex-col sm:col-span-1 sm:justify-center" data-testid="auction-upgrade-cell">
        {MOBILE_LABEL}
        <span className="text-xs text-muted-foreground">Can&apos;t use</span>
      </div>
    );
  }

  if (upgrade.kind === "unknown-stats") {
    return (
      <div className="col-span-2 flex flex-col sm:col-span-1 sm:justify-center" data-testid="auction-upgrade-cell">
        {MOBILE_LABEL}
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    );
  }

  const { verdict, equippedItemId, equippedName } = upgrade;
  const equippedIcon = itemIcon(equippedItemId);
  const style = verdict ? VERDICT_STYLES[verdict.kind] : null;

  return (
    <div
      className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1 sm:justify-center"
      data-testid="auction-upgrade-cell"
    >
      {MOBILE_LABEL}
      {verdict && style ? (
        <p className={`text-xs font-semibold ${style.text}`} data-verdict={verdict.kind}>
          {style.arrow ? <span aria-hidden="true">{style.arrow} </span> : null}
          {verdictText(verdict)}
        </p>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
      <div className="flex min-w-0 items-center gap-1">
        <GameIcon icon={equippedIcon} size={16} alt="" />
        <span className="min-w-0 truncate text-xs text-muted-foreground">{equippedName}</span>
      </div>
    </div>
  );
}
