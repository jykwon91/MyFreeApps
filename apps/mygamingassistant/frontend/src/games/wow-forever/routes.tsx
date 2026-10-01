import { lazy, Suspense, type ReactElement } from "react";
import type { RouteObject } from "react-router-dom";
import WowPageSkeleton from "@/games/wow-forever/components/shared/WowPageSkeleton";

// Lazy so the lineup library's bundle doesn't carry the WoW pages.
const WowForeverLanding = lazy(() => import("@/games/wow-forever/pages/WowForeverLanding"));
const WowGuidePage = lazy(() => import("@/games/wow-forever/pages/WowGuidePage"));
const WowComparePage = lazy(() => import("@/games/wow-forever/pages/WowComparePage"));
const WowWorldMapPage = lazy(() => import("@/games/wow-forever/pages/WowWorldMapPage"));
const WowProfessionsPage = lazy(() => import("@/games/wow-forever/pages/WowProfessionsPage"));
const WowFoodPickerPage = lazy(() => import("@/games/wow-forever/pages/WowFoodPickerPage"));
const WowFoodDetailPage = lazy(() => import("@/games/wow-forever/pages/WowFoodDetailPage"));
const WowGoldPage = lazy(() => import("@/games/wow-forever/pages/WowGoldPage"));

function withSuspense(page: ReactElement): ReactElement {
  return <Suspense fallback={<WowPageSkeleton />}>{page}</Suspense>;
}

/**
 * Public WoW Forever pages. Mounted in `src/routes.tsx` BEFORE `/:gameSlug`
 * (the lineup map grid) so "wow-forever" is never treated as a lineup game.
 */
export const wowForeverRoutes: RouteObject[] = [
  { path: "/wow-forever", element: withSuspense(<WowForeverLanding />) },
  { path: "/wow-forever/guide", element: withSuspense(<WowGuidePage />) },
  { path: "/wow-forever/compare", element: withSuspense(<WowComparePage />) },
  { path: "/wow-forever/map", element: withSuspense(<WowWorldMapPage />) },
  { path: "/wow-forever/professions", element: withSuspense(<WowProfessionsPage />) },
  { path: "/wow-forever/food", element: withSuspense(<WowFoodPickerPage />) },
  { path: "/wow-forever/food/:foodId", element: withSuspense(<WowFoodDetailPage />) },
  { path: "/wow-forever/gold", element: withSuspense(<WowGoldPage />) },
];
