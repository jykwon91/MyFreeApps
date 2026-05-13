import { type RouteObject } from "react-router-dom";
import GameGrid from "@/pages/GameGrid";
import LineupPackages from "@/pages/LineupPackages";
import LineupUpload from "@/pages/LineupUpload";
import LiveCs2 from "@/pages/LiveCs2";
import LiveCs2Setup from "@/pages/LiveCs2Setup";
import MapGrid from "@/pages/MapGrid";
import MapPage from "@/pages/MapPage";
import Review from "@/pages/Review";
import Security from "@/pages/Security";
import Settings from "@/pages/Settings";
import Sources from "@/pages/Sources";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import NotFound from "@/pages/NotFound";
import RootLayout from "@/RootLayout";

// MGA is single-user — no /register route.
//
// PR 8 adds the `/live/cs2` and `/live/cs2/setup` routes. Both are mounted
// for ALL builds (web + desktop) so the routes resolve; the page
// components themselves runtime-gate via `isTauri()` and render a
// "desktop-only feature" placeholder in the web bundle.

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <GameGrid /> },
      { path: "/lineups/new", element: <LineupUpload /> },
      { path: "/packages", element: <LineupPackages /> },
      { path: "/sources", element: <Sources /> },
      { path: "/review", element: <Review /> },
      { path: "/live/cs2", element: <LiveCs2 /> },
      { path: "/live/cs2/setup", element: <LiveCs2Setup /> },
      { path: "/:gameSlug", element: <MapGrid /> },
      { path: "/:gameSlug/:mapSlug", element: <MapPage /> },
      { path: "/settings", element: <Settings /> },
      { path: "/security", element: <Security /> },
    ],
  },
  { path: "/login", element: <Login /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "*", element: <NotFound /> },
];
