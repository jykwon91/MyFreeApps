const BAR = "rounded bg-muted/40 animate-pulse";
const LEVEL_ROWS = 6;
const TRAINER_ROWS = 3;

/** Same shape as a loaded class or profession: a heading, the level (or rank) cards, then the trainer list. */
export default function TrainersSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading trainers" data-testid="trainers-skeleton">
      <div className={`h-6 w-48 ${BAR}`} aria-hidden />
      <ul className="space-y-2" aria-hidden>
        {Array.from({ length: LEVEL_ROWS }, (_, i) => (
          <li key={i} className="flex gap-3 rounded-xl border bg-card p-3">
            <div className={`h-10 w-14 shrink-0 ${BAR}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-4 w-1/2 ${BAR}`} />
              <div className={`h-4 w-1/3 ${BAR}`} />
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-2 rounded-xl border bg-card p-3" aria-hidden>
        <div className={`h-5 w-32 ${BAR}`} />
        {Array.from({ length: TRAINER_ROWS }, (_, i) => (
          <div key={i} className={`h-5 w-full ${BAR}`} />
        ))}
      </div>
    </div>
  );
}
