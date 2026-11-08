import { ITEM_BROWSER_SKELETON_ROWS } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";

const BAR = "rounded bg-muted/40 animate-pulse";

/** Same shape as the loaded page: search box, filters card (a button on phones), count + toolbar, then item rows. */
export default function ItemBrowserSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading items" data-testid="item-browser-skeleton">
      <div className="space-y-1" aria-hidden>
        <div className={`h-5 w-40 ${BAR}`} />
        <div className={`h-11 w-full ${BAR}`} />
      </div>
      <div className={`h-11 w-full sm:hidden ${BAR}`} aria-hidden />
      <div className="hidden space-y-4 rounded-xl border bg-card p-4 sm:block" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-1">
            <div className={`h-5 w-24 ${BAR}`} />
            <div className={`h-11 w-3/4 ${BAR}`} />
          </div>
        ))}
      </div>
      <div className="space-y-2" aria-hidden>
        <div className={`h-5 w-24 ${BAR}`} />
        <div className={`h-[46px] w-full sm:w-2/3 ${BAR}`} />
      </div>
      <ul className="divide-y rounded-xl border bg-card" aria-hidden>
        {Array.from({ length: ITEM_BROWSER_SKELETON_ROWS }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 sm:px-4" data-testid="item-browser-skeleton-row">
            <div className={`h-8 w-8 shrink-0 ${BAR}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-5 w-1/2 ${BAR}`} />
              <div className={`h-4 w-2/3 ${BAR}`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
