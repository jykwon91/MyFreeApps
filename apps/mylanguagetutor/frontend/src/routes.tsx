import { type RouteObject } from "react-router-dom";
import { Support } from "@platform/ui";
import Home from "@/pages/Home";
import Security from "@/pages/Security";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import NotFound from "@/pages/NotFound";
import RootLayout from "@/RootLayout";

// Multi-user app -- self-serve /register route enabled (mirrors MyRecipes).
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
  { path: "/support-myfreeapps", element: <Support appName="MyLanguageTutor" /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "*", element: <NotFound /> },
];
