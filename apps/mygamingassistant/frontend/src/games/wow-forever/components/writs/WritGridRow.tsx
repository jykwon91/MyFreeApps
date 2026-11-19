import clsx from "clsx";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import WritItemCell from "@/games/wow-forever/components/writs/WritItemCell";
import WritPriceBreakdown from "@/games/wow-forever/components/writs/WritPriceBreakdown";
import WritPriceCell from "@/games/wow-forever/components/writs/WritPriceCell";
import WritTierBadge from "@/games/wow-forever/components/writs/WritTierBadge";
import WritTotalCell from "@/games/wow-forever/components/writs/WritTotalCell";
import WritTurnInCell from "@/games/wow-forever/components/writs/WritTurnInCell";
import { WRIT_DEAL_LOOK, WRIT_ROW_GRID, WRIT_ROW_LOOK } from "@/games/wow-forever/components/writs/writRowStyles";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";

interface WritGridRowProps {
  row: WritRow;
  /** True while the prices load: price cells show a skeleton. */
  loading: boolean;
}

/** One writ: a card on a phone (name and tier, item, big total, the sum, turn-in), a table row from lg up. */
export default function WritGridRow({ row, loading }: WritGridRowProps) {
  const { writ } = row;
  const dimmed = !loading && row.total === null;
  return (
    <div
      role="row"
      data-testid="writ-row"
      data-deal={row.deal}
      data-tier={writ.tier}
      className={clsx(WRIT_ROW_GRID, WRIT_ROW_LOOK, row.deal && WRIT_DEAL_LOOK, dimmed && "opacity-70")}
    >
      <div role="cell" className="flex min-w-0 flex-wrap items-center gap-x-2">
        <ItemNameLink
          itemId={writ.id}
          name={writ.name}
          withIcon
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium lg:min-h-0"
        />
        <WritTierBadge tier={writ.tier} className="lg:hidden" />
      </div>
      <div role="cell" className="hidden lg:block">
        <WritTierBadge tier={writ.tier} />
      </div>
      <div role="cell" className="hidden lg:block">
        <WritPriceCell copper={row.writPrice} loading={loading} />
      </div>
      <div role="cell" className="min-w-0">
        <WritItemCell writ={writ} />
      </div>
      <div role="cell" className="hidden lg:block">
        <WritPriceCell copper={row.itemPrice} loading={loading} />
      </div>
      <div role="cell">
        <WritTotalCell row={row} loading={loading} />
      </div>
      <div role="cell" className="lg:hidden">
        {loading ? null : <WritPriceBreakdown row={row} />}
      </div>
      <div role="cell" className="min-w-0">
        <WritTurnInCell turnIn={row.turnIn} />
      </div>
    </div>
  );
}
