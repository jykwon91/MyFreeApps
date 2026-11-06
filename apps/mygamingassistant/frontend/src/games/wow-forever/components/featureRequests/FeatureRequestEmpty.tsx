interface FeatureRequestEmptyProps {
  /** "filtered": nothing matches these filters; "none": the board has nothing at all yet. */
  variant: "none" | "filtered";
  onClearFilters: () => void;
  onWriteIdea: () => void;
}

const ACTION = "min-h-[44px] rounded-md border px-4 text-sm font-medium hover:bg-muted/40";

/** The board with no stories to show — and the one thing to do about it. */
export default function FeatureRequestEmpty({ variant, onClearFilters, onWriteIdea }: FeatureRequestEmptyProps) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed p-6 text-center">
      {variant === "filtered" ? (
        <>
          <p className="text-sm text-muted-foreground">No requests match these filters.</p>
          <button type="button" onClick={onClearFilters} className={ACTION}>
            Clear filters
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Nothing here yet. Yours could be the first.</p>
          <button type="button" onClick={onWriteIdea} className={ACTION}>
            Write your idea
          </button>
        </>
      )}
    </div>
  );
}
