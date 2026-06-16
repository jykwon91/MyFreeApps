import { type RouteObject } from "react-router-dom";
import { Support } from "@platform/ui";
import Home from "@/pages/Home";
import Security from "@/pages/Security";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import NotFound from "@/pages/NotFound";
import RootLayout from "@/RootLayout";

// Scaffolded app -- single-user, no /register route.
// Add app-specific authenticated routes inside the RootLayout children array.

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "/settings", element: <Settings /> },
      { path: "/security", element: <Security /> },
    ],
  },
  // Public support / donation page — standalone (no shell, no auth).
  { path: "/support-myfreeapps", element: <Support appName="__APP_DISPLAY_NAME__" /> },
  { path: "/login", element: <Login /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "*", element: <NotFound /> },
];
