const ROWS = 6;
/** Every crafting profession has a drop-only recipe. */
const PROFESSION_BUTTONS = 7;
/** "All" plus the four kinds of source. */
const SOURCE_BUTTONS = 5;
const SORT_BUTTONS = 2;

/** The character box, the filters, the count and a few closed recipe rows, while the recipes load. */
export default function DropRecipesSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden data-testid="drop-recipes-skeleton">
      <div className="space-y-3 rounded-xl border bg-card p-4" data-testid="drop-recipes-skeleton-character">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <div className="h-5 w-64 max-w-full rounded bg-muted" />
            <div className="h-11 rounded-md bg-muted" />
          </div>
          <div className="h-11 w-24 rounded-md bg-muted" />
        </div>
        <div className="h-4 w-full max-w-md rounded bg-muted" />
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="grid grid-cols-3 gap-1 rounded-lg border bg-card p-1 sm:grid-cols-4">
            {Array.from({ length: PROFESSION_BUTTONS }, (_, i) => (
              <div key={i} className="h-[54px] rounded-md bg-muted sm:h-9" />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="space-y-1">
            <div className="h-5 w-28 rounded bg-muted" />
            <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
              {Array.from({ length: SOURCE_BUTTONS }, (_, i) => (
                <div key={i} className="h-9 w-20 rounded-md bg-muted" />
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <div className="h-5 w-14 rounded bg-muted" />
            <div className="flex gap-1 rounded-lg border bg-card p-1">
              {Array.from({ length: SORT_BUTTONS }, (_, i) => (
                <div key={i} className="h-9 w-20 rounded-md bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="h-5 w-24 rounded bg-muted" />
      <ul className="space-y-2">
        {Array.from({ length: ROWS }, (_, i) => (
          <li key={i} className="h-[92px] rounded-lg border bg-card" />
        ))}
      </ul>
    </div>
  );
}
