import { type RouteObject } from "react-router-dom";
import { AuthRequired, Support } from "@platform/ui";
import Recipes from "@/pages/Recipes";
import RecipeDetail from "@/pages/RecipeDetail";
import RecipeEditor from "@/pages/RecipeEditor";
import RecipeImport from "@/pages/RecipeImport";
import VersionDiff from "@/pages/VersionDiff";
import Security from "@/pages/Security";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import NotFound from "@/pages/NotFound";
import RootLayout from "@/RootLayout";

// Multi-user app — self-serve /register route enabled (mirrors MJH/MBK).
//
// MyRecipes uses public-read / auth-write: anyone can browse the recipe
// library (list, detail, version diffs), but write surfaces (create / import /
// tweak) and account pages (settings / security) are wrapped in <AuthRequired>,
// which shows a Sign-in CTA carrying the current path when unauthenticated.
// See apps/myrecipes/CLAUDE.md and apps/mygamingassistant CLAUDE.md →
// Authentication Model for the shared pattern.

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      // Public routes — anyone can browse.
      { index: true, element: <Recipes /> },
      { path: "/recipes/:id", element: <RecipeDetail /> },
      {
        path: "/recipes/:id/versions/:vid/diff",
        element: <VersionDiff />,
      },

      // Auth-required — write surfaces + account pages. Each is wrapped in
      // <AuthRequired> with a tailored ``action`` so the sign-in card explains
      // exactly what signing in unlocks.
      {
        path: "/recipes/new",
        element: (
          <AuthRequired action="create a new recipe">
            <RecipeEditor />
          </AuthRequired>
        ),
      },
      {
        path: "/recipes/import",
        element: (
          <AuthRequired action="import a recipe from a photo">
            <RecipeImport />
          </AuthRequired>
        ),
      },
      {
        path: "/recipes/:id/tweak",
        element: (
          <AuthRequired action="tweak this recipe">
            <RecipeEditor />
          </AuthRequired>
        ),
      },
      {
        path: "/settings",
        element: (
          <AuthRequired action="manage your settings">
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
  // Public support / donation page — standalone (no shell, no auth).
  { path: "/support-myfreeapps", element: <Support appName="MyRecipes" /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "*", element: <NotFound /> },
];
