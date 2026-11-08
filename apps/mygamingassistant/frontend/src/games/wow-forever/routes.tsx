import { lazy, Suspense, type ReactElement } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import WowSuggestFooterLink from "@/games/wow-forever/components/featureRequests/WowSuggestFooterLink";
import ProvenanceGuide from "@/games/wow-forever/components/shared/ProvenanceGuide";
import WowLegalNotice from "@/games/wow-forever/components/shared/WowLegalNotice";
import WowPageSkeleton from "@/games/wow-forever/components/shared/WowPageSkeleton";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";

// Lazy so the lineup library's bundle doesn't carry the WoW pages.
const WowForeverLanding = lazy(() => import("@/games/wow-forever/pages/WowForeverLanding"));
const WowComparePage = lazy(() => import("@/games/wow-forever/pages/WowComparePage"));
const WowWorldMapPage = lazy(() => import("@/games/wow-forever/pages/WowWorldMapPage"));
const WowProfessionsPage = lazy(() => import("@/games/wow-forever/pages/WowProfessionsPage"));
const WowFoodPickerPage = lazy(() => import("@/games/wow-forever/pages/WowFoodPickerPage"));
const WowFoodDetailPage = lazy(() => import("@/games/wow-forever/pages/WowFoodDetailPage"));
const WowGoldPage = lazy(() => import("@/games/wow-forever/pages/WowGoldPage"));
const WowAuctionHousePage = lazy(() => import("@/games/wow-forever/pages/WowAuctionHousePage"));
const WowMacrosPage = lazy(() => import("@/games/wow-forever/pages/WowMacrosPage"));
const WowGearPage = lazy(() => import("@/games/wow-forever/pages/WowGearPage"));
const WowDungeonsPage = lazy(() => import("@/games/wow-forever/pages/WowDungeonsPage"));
const WowDungeonPage = lazy(() => import("@/games/wow-forever/pages/WowDungeonPage"));
const WowRaresPage = lazy(() => import("@/games/wow-forever/pages/WowRaresPage"));
const WowTalentsPage = lazy(() => import("@/games/wow-forever/pages/WowTalentsPage"));
const WowRacesPage = lazy(() => import("@/games/wow-forever/pages/WowRacesPage"));
const WowSpellbookPage = lazy(() => import("@/games/wow-forever/pages/WowSpellbookPage"));
const WowDownrankPage = lazy(() => import("@/games/wow-forever/pages/WowDownrankPage"));
const WowChangesPage = lazy(() => import("@/games/wow-forever/pages/WowChangesPage"));
const WowServerStatusPage = lazy(() => import("@/games/wow-forever/pages/WowServerStatusPage"));
const WowItemPage = lazy(() => import("@/games/wow-forever/pages/WowItemPage"));
const WowItemsPage = lazy(() => import("@/games/wow-forever/pages/WowItemsPage"));
const WowRaidPage = lazy(() => import("@/games/wow-forever/pages/WowRaidPage"));
const WowRaidPlannerPage = lazy(() => import("@/games/wow-forever/pages/WowRaidPlannerPage"));
const WowSuggestPage = lazy(() => import("@/games/wow-forever/pages/WowSuggestPage"));
const WowAskPage = lazy(() => import("@/games/wow-forever/pages/WowAskPage"));
const WowTriagePage = lazy(() => import("@/games/wow-forever/pages/WowTriagePage"));

function withSuspense(page: ReactElement): ReactElement {
  return <Suspense fallback={<WowPageSkeleton />}>{page}</Suspense>;
}

/**
 * A public WoW Forever page with "How to read these tags" and the Blizzard trademark / art notice
 * under it — the one place either is mounted.
 */
function withLegalNotice(page: ReactElement): ReactElement {
  // Inside the Suspense boundary, so the footer arrives with the page rather than under its skeleton.
  return withSuspense(
    <>
      {page}
      <ProvenanceGuide />
      <WowLegalNotice />
    </>,
  );
}

/**
 * A WoW Forever page with the shared "Missing something? Suggest a feature" footer — the one place it's
 * mounted. `area` opens the suggest board on what players asked for about this page (null: every area).
 */
function withSuggestFooter(page: ReactElement, area: FeatureArea | null): ReactElement {
  return withLegalNotice(
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
  // The New Player Guide was removed — redirect so old links don't 404.
  { path: "/wow-forever/guide", element: <Navigate to="/wow-forever" replace /> },
  { path: "/wow-forever/compare", element: withSuggestFooter(<WowComparePage />, "gear_upgrades") },
  { path: "/wow-forever/map", element: withSuggestFooter(<WowWorldMapPage />, "map_travel") },
  { path: "/wow-forever/professions", element: withSuggestFooter(<WowProfessionsPage />, "professions") },
  { path: "/wow-forever/food", element: withSuggestFooter(<WowFoodPickerPage />, "food_consumables") },
  { path: "/wow-forever/food/:foodId", element: withSuggestFooter(<WowFoodDetailPage />, "food_consumables") },
  { path: "/wow-forever/gold", element: withSuggestFooter(<WowGoldPage />, "gold_economy") },
  { path: "/wow-forever/auction-house", element: withSuggestFooter(<WowAuctionHousePage />, "gold_economy") },
  { path: "/wow-forever/macros", element: withSuggestFooter(<WowMacrosPage />, "class_guides") },
  { path: "/wow-forever/talents", element: withSuggestFooter(<WowTalentsPage />, "class_guides") },
  { path: "/wow-forever/talents/:class", element: withSuggestFooter(<WowTalentsPage />, "class_guides") },
  { path: "/wow-forever/races", element: withSuggestFooter(<WowRacesPage />, "class_guides") },
  { path: "/wow-forever/races/:race", element: withSuggestFooter(<WowRacesPage />, "class_guides") },
  { path: "/wow-forever/spellbook", element: withSuggestFooter(<WowSpellbookPage />, "class_guides") },
  { path: "/wow-forever/spellbook/:class", element: withSuggestFooter(<WowSpellbookPage />, "class_guides") },
  { path: "/wow-forever/downrank", element: withSuggestFooter(<WowDownrankPage />, "class_guides") },
  { path: "/wow-forever/changes", element: withSuggestFooter(<WowChangesPage />, "class_guides") },
  { path: "/wow-forever/server-status", element: withSuggestFooter(<WowServerStatusPage />, "site_app") },
  { path: "/wow-forever/ask", element: withSuggestFooter(<WowAskPage />, "site_app") },
  // The old Warlock-only page: same macros, now the Warlock filter of the Macros page.
  { path: "/wow-forever/warlock-macros", element: <Navigate to="/wow-forever/macros?class=warlock" replace /> },
  { path: "/wow-forever/gear", element: withSuggestFooter(<WowGearPage />, "gear_upgrades") },
  { path: "/wow-forever/items", element: withSuggestFooter(<WowItemsPage />, "gear_upgrades") },
  { path: "/wow-forever/items/:id", element: withSuggestFooter(<WowItemPage />, "gear_upgrades") },
  { path: "/wow-forever/dungeons", element: withSuggestFooter(<WowDungeonsPage />, "dungeons_raids") },
  { path: "/wow-forever/dungeons/:slug", element: withSuggestFooter(<WowDungeonPage />, "dungeons_raids") },
  { path: "/wow-forever/rares", element: withSuggestFooter(<WowRaresPage />, "map_travel") },
  { path: "/wow-forever/raids/:webId", element: withSuggestFooter(<WowRaidPage />, "dungeons_raids") },
  { path: "/wow-forever/raids/:webId/plan", element: withSuggestFooter(<WowRaidPlannerPage />, "dungeons_raids") },
  // The suggest page itself: no footer.
  { path: "/wow-forever/suggest", element: withLegalNotice(<WowSuggestPage />) },
  // The operator-only triage screen: no footer, linked from nowhere, its own chunk.
  { path: "/wow-forever/triage", element: withSuspense(<WowTriagePage />) },
];
