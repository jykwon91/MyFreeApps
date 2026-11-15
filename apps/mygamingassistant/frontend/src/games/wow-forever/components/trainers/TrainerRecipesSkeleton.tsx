const BAR = "rounded bg-muted animate-pulse";
const RECIPE_ROWS = 8;

/** Placeholder while the trainer's recipe list loads — mirrors the loaded layout. */
export default function TrainerRecipesSkeleton() {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-busy="true"
      aria-label="Loading recipes"
      data-testid="trainer-recipes-skeleton"
    >
      {/* Skill input row */}
      <div className={`h-9 w-32 ${BAR}`} aria-hidden />
      {/* Recipe rows */}
      <ul className="space-y-2" aria-hidden>
        {Array.from({ length: RECIPE_ROWS }, (_, i) => (
          <li key={i} className="flex items-start gap-3 py-1.5">
            <div className={`h-8 w-8 shrink-0 rounded ${BAR}`} />
            <div className="flex-1 space-y-1.5">
              <div className={`h-4 w-2/3 ${BAR}`} />
              <div className={`h-3 w-1/3 ${BAR}`} />
            </div>
            <div className={`h-4 w-14 shrink-0 ${BAR}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
