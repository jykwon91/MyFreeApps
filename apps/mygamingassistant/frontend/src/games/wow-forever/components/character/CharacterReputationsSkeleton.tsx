const OPEN_ROWS = 3;
const CLOSED_GROUPS = 3;

/** The reputation section's shape while it loads: heading, the first group open, the rest closed. */
export default function CharacterReputationsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden data-testid="character-reputations-skeleton">
      <div className="h-7 w-32 rounded-md bg-muted/40 animate-pulse" />
      <div className="space-y-2 rounded-xl bg-muted/20 p-3">
        <div className="h-6 w-40 rounded-md bg-muted/40 animate-pulse" />
        {Array.from({ length: OPEN_ROWS }, (_, i) => (
          <div key={i} className="h-12 rounded-md bg-muted/40 animate-pulse" />
        ))}
      </div>
      {Array.from({ length: CLOSED_GROUPS }, (_, i) => (
        <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}
