import { type RouteObject } from "react-router-dom";
import GameGrid from "@/pages/GameGrid";
import LineupPackages from "@/pages/LineupPackages";
import LineupUpload from "@/pages/LineupUpload";
import LiveCs2 from "@/pages/LiveCs2";
import LiveCs2Calibrate from "@/pages/LiveCs2Calibrate";
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
import AuthRequired from "@/components/auth/AuthRequired";

// MGA is single-user — no /register route.
//
// MGA uses public-read / auth-write — anyone can browse the lineup library,
// only the operator can mutate content. Public routes render inline; gated
// routes are wrapped in <AuthRequired> which shows a Sign-in CTA when not
// authenticated.
//
// See apps/mygamingassistant/CLAUDE.md → Authentication Model.
//
// Tauri note: The `/live/cs2` and `/live/cs2/setup` routes are mounted for
// ALL builds (web + desktop) so the routes resolve; the page components
// themselves runtime-gate via `isTauri()` and render a "desktop-only
// feature" placeholder in the web bundle.

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      // Public routes — anyone can browse.
      { index: true, element: <GameGrid /> },
      { path: "/packages", element: <LineupPackages /> },
      { path: "/live/cs2", element: <LiveCs2 /> },
      { path: "/:gameSlug", element: <MapGrid /> },
      { path: "/:gameSlug/:mapSlug", element: <MapPage /> },

      // Auth-required — operator only. Each is wrapped in <AuthRequired>
      // with a tailored ``action`` string so the fallback explains exactly
      // what signing in unlocks.
      {
        path: "/lineups/new",
        element: (
          <AuthRequired action="upload a new lineup">
            <LineupUpload />
          </AuthRequired>
        ),
      },
      {
        path: "/sources",
        element: (
          <AuthRequired action="manage video sources">
            <Sources />
          </AuthRequired>
        ),
      },
      {
        path: "/review",
        element: (
          <AuthRequired action="review pending lineups">
            <Review />
          </AuthRequired>
        ),
      },
      {
        path: "/live/cs2/setup",
        element: (
          <AuthRequired action="install the GSI config">
            <LiveCs2Setup />
          </AuthRequired>
        ),
      },
      {
        path: "/live/cs2/calibrate",
        element: (
          <AuthRequired action="calibrate the minimap CV pipeline">
            <LiveCs2Calibrate />
          </AuthRequired>
        ),
      },
      {
        path: "/settings",
        element: (
          <AuthRequired action="manage your account">
            <Settings />
          </AuthRequired>
        ),
      },
      {
        path: "/security",
        element: (
          <AuthRequired action="manage account security">
            <Security />
          </AuthRequired>
        ),
      },
    ],
  },
  { path: "/login", element: <Login /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "*", element: <NotFound /> },
];
