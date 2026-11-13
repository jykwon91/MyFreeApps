const MAIN_ROWS = 2;
const SECONDARY_ROWS = 3;

/** The professions section's shape while it loads: heading, then the main and secondary cards. */
export default function CharacterProfessionsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden data-testid="character-professions-skeleton">
      <div className="h-7 w-32 rounded-md bg-muted animate-pulse" />
      {[MAIN_ROWS, SECONDARY_ROWS].map((rows, group) => (
        <div key={group} className="space-y-2">
          <div className="h-5 w-36 rounded-md bg-muted animate-pulse" />
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="h-[72px] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
