import { lazy, Suspense, type ReactElement } from "react";
import type { RouteObject } from "react-router-dom";
import WowSuggestFooterLink from "@/games/wow-forever/components/featureRequests/WowSuggestFooterLink";
import WowPageSkeleton from "@/games/wow-forever/components/shared/WowPageSkeleton";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";

// Lazy so the lineup library's bundle doesn't carry the WoW pages.
const WowForeverLanding = lazy(() => import("@/games/wow-forever/pages/WowForeverLanding"));
const WowGuidePage = lazy(() => import("@/games/wow-forever/pages/WowGuidePage"));
const WowComparePage = lazy(() => import("@/games/wow-forever/pages/WowComparePage"));
const WowWorldMapPage = lazy(() => import("@/games/wow-forever/pages/WowWorldMapPage"));
const WowProfessionsPage = lazy(() => import("@/games/wow-forever/pages/WowProfessionsPage"));
const WowFoodPickerPage = lazy(() => import("@/games/wow-forever/pages/WowFoodPickerPage"));
const WowFoodDetailPage = lazy(() => import("@/games/wow-forever/pages/WowFoodDetailPage"));
const WowGoldPage = lazy(() => import("@/games/wow-forever/pages/WowGoldPage"));
const WowWarlockMacrosPage = lazy(() => import("@/games/wow-forever/pages/WowWarlockMacrosPage"));
const WowGearPage = lazy(() => import("@/games/wow-forever/pages/WowGearPage"));
const WowRaidPage = lazy(() => import("@/games/wow-forever/pages/WowRaidPage"));
const WowRaidPlannerPage = lazy(() => import("@/games/wow-forever/pages/WowRaidPlannerPage"));
const WowSuggestPage = lazy(() => import("@/games/wow-forever/pages/WowSuggestPage"));

function withSuspense(page: ReactElement): ReactElement {
  return <Suspense fallback={<WowPageSkeleton />}>{page}</Suspense>;
}

/**
 * A WoW Forever page with the shared "Missing something? Suggest a feature" footer — the one place it's
 * mounted. `area` opens the suggest board on what players asked for about this page (null: every area).
 */
function withSuggestFooter(page: ReactElement, area: FeatureArea | null): ReactElement {
  // Inside the Suspense boundary, so the footer arrives with the page rather than under its skeleton.
  return withSuspense(
    <>
      {page}
      <WowSuggestFooterLink area={area} />
    </>,
  );
}

/**
 * Public WoW Forever pages. Mounted in `src/routes.tsx` BEFORE `/:gameSlug`
 * (the lineup map grid) so "wow-forever" is never treated as a lineup game.
 */
export const wowForeverRoutes: RouteObject[] = [
  { path: "/wow-forever", element: withSuggestFooter(<WowForeverLanding />, null) },
  { path: "/wow-forever/guide", element: withSuggestFooter(<WowGuidePage />, "leveling_quests") },
  { path: "/wow-forever/compare", element: withSuggestFooter(<WowComparePage />, "gear_upgrades") },
  { path: "/wow-forever/map", element: withSuggestFooter(<WowWorldMapPage />, "map_travel") },
  { path: "/wow-forever/professions", element: withSuggestFooter(<WowProfessionsPage />, "professions") },
  { path: "/wow-forever/food", element: withSuggestFooter(<WowFoodPickerPage />, "food_consumables") },
  { path: "/wow-forever/food/:foodId", element: withSuggestFooter(<WowFoodDetailPage />, "food_consumables") },
  { path: "/wow-forever/gold", element: withSuggestFooter(<WowGoldPage />, "gold_economy") },
  { path: "/wow-forever/warlock-macros", element: withSuggestFooter(<WowWarlockMacrosPage />, "class_guides") },
  { path: "/wow-forever/gear", element: withSuggestFooter(<WowGearPage />, "gear_upgrades") },
  { path: "/wow-forever/raids/:webId", element: withSuggestFooter(<WowRaidPage />, "dungeons_raids") },
  { path: "/wow-forever/raids/:webId/plan", element: withSuggestFooter(<WowRaidPlannerPage />, "dungeons_raids") },
  // The suggest page itself: no footer.
  { path: "/wow-forever/suggest", element: withSuspense(<WowSuggestPage />) },
];
