import { type RouteObject } from "react-router-dom";
import GameGrid from "@/pages/GameGrid";
import LineupUpload from "@/pages/LineupUpload";
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

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <GameGrid /> },
      { path: "/lineups/new", element: <LineupUpload /> },
      { path: "/sources", element: <Sources /> },
      { path: "/review", element: <Review /> },
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
