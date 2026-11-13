import { Skeleton } from "@platform/ui";
import {
  CATALOG_HEADER,
  CATALOG_HEADER_LINE,
  CATALOG_PAGE,
  CATALOG_TOUCH_ROW,
  SCENARIO_CARD_BOX,
  SCENARIO_GOAL_GAP,
  SCENARIO_LIST,
  SCENARIO_SKELETON_ROWS,
} from "@/constants/catalogLayout";
import TwoLinePlaceholder from "@/features/catalog/TwoLinePlaceholder";

/**
 * Mirrors ScenarioPath box for box: the heading, the level line (a 44px touch
 * row, in the same block-plus-inline-flex structure so its height can't drift),
 * the "pick a scenario" line, then cards with a title and a goal line. The
 * daily-cap notice isn't mirrored: whether it shows can't be known until usage
 * loads, so the list moves down by the notice when a capped learner's page
 * arrives.
 */
export default function CatalogSkeleton() {
  return (
    <div className={CATALOG_PAGE} aria-busy="true" aria-label="Loading scenarios">
      <div className={CATALOG_HEADER}>
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        {/* A div, not the page's <p>: Skeleton renders a div, which a <p> can't hold. Same boxes. */}
        <div className={CATALOG_HEADER_LINE}>
          <div className={CATALOG_TOUCH_ROW}>
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <TwoLinePlaceholder firstWidth="w-3/4 max-w-md" />
      </div>
      <ul className={SCENARIO_LIST}>
        {Array.from({ length: SCENARIO_SKELETON_ROWS }, (_, i) => (
          <li key={i} className={SCENARIO_CARD_BOX}>
            <Skeleton className="h-6 w-1/3" />
            <TwoLinePlaceholder className={SCENARIO_GOAL_GAP} firstWidth="w-4/5" />
          </li>
        ))}
      </ul>
    </div>
  );
}
