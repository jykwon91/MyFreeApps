import type { ReactNode } from "react";
import { Panel, PanelTitle } from "@platform/ui";
import { FILTER_SHEET_COPY } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { filterSheetApplyLabel } from "@/games/wow-forever/lib/auctionHouse/filterSheetApplyLabel";

interface AuctionFilterSheetProps {
  onClose: () => void;
  /** Items that match right now, shown on the Apply button. */
  resultCount: number | null;
  canClear: boolean;
  onClear: () => void;
  children: ReactNode;
}

/**
 * The phone's filter sheet, on the shared Panel (a bottom drawer on a phone): it traps focus, closes on Escape or a
 * tap outside, and hands focus back to the Filters button. Filters apply as they are changed, so Apply just closes
 * it with the count in view. Mount it only while open.
 */
export default function AuctionFilterSheet({ onClose, resultCount, canClear, onClear, children }: AuctionFilterSheetProps) {
  return (
    <Panel position="right" onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col text-card-foreground" data-testid="auction-filter-sheet">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <PanelTitle asChild>
            <h2 className="text-base font-semibold">{FILTER_SHEET_COPY.title}</h2>
          </PanelTitle>
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            className="min-h-[44px] rounded-md px-3 text-sm font-medium underline disabled:no-underline disabled:opacity-50"
          >
            {FILTER_SHEET_COPY.clearAll}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        <div className="border-t p-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {filterSheetApplyLabel(resultCount)}
          </button>
        </div>
      </div>
    </Panel>
  );
}
