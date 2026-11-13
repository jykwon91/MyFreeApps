interface AuctionEmptyResultsProps {
  message: string;
  /** Present when a filter is on: offers to clear the filters. */
  onClear: (() => void) | null;
}

/** Nothing matches: says what was asked for and how to loosen it. */
export default function AuctionEmptyResults({ message, onClear }: AuctionEmptyResultsProps) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed bg-card p-6 text-sm" data-testid="auction-empty">
      <p className="text-muted-foreground">{message}</p>
      {onClear && (
        <button type="button" onClick={onClear} className="min-h-[44px] rounded-md border px-4 font-medium hover:bg-muted/40">
          Clear filters
        </button>
      )}
    </div>
  );
}
