const CARDS = 6;

/** Placeholder for the macro cards: the same one-column list of cards the loaded page shows. */
export default function WarlockMacrosSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4" aria-busy="true" aria-label="Loading macros">
      {Array.from({ length: CARDS }, (_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 space-y-3" aria-hidden>
          <div className="h-5 w-48 rounded-md bg-muted/40 animate-pulse" />
          <div className="h-4 w-full rounded-md bg-muted/40 animate-pulse" />
          <div className="h-16 rounded-md bg-muted/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
