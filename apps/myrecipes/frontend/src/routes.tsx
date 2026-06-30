import { type RouteObject } from "react-router-dom";
import { Support } from "@platform/ui";
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

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <Recipes /> },
      { path: "/recipes/new", element: <RecipeEditor /> },
      { path: "/recipes/import", element: <RecipeImport /> },
      { path: "/recipes/:id", element: <RecipeDetail /> },
      { path: "/recipes/:id/tweak", element: <RecipeEditor /> },
      {
        path: "/recipes/:id/versions/:vid/diff",
        element: <VersionDiff />,
      },
      { path: "/settings", element: <Settings /> },
      { path: "/security", element: <Security /> },
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
