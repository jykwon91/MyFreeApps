import { type RouteObject } from "react-router-dom";
import Home from "@/pages/Home";
import Drops from "@/pages/Drops";
import Menu from "@/pages/Menu";
import Service from "@/pages/Service";
import Financials from "@/pages/Financials";
import Customers from "@/pages/Customers";
import Security from "@/pages/Security";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import NotFound from "@/pages/NotFound";
import PublicOrder from "@/pages/PublicOrder";
import PublicOrderStatus from "@/pages/PublicOrderStatus";
import RootLayout from "@/RootLayout";

// Scaffolded app -- single-user, no /register route.
// Add app-specific authenticated routes inside the RootLayout children array.
// Customer-facing routes (e.g. /order) live OUTSIDE RootLayout so they do
// not require auth or render the operator shell.

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "/drops", element: <Drops /> },
      { path: "/menu", element: <Menu /> },
      { path: "/service", element: <Service /> },
      { path: "/financials", element: <Financials /> },
      { path: "/customers", element: <Customers /> },
      { path: "/settings", element: <Settings /> },
      { path: "/security", element: <Security /> },
    ],
  },
  { path: "/order", element: <PublicOrder /> },
  { path: "/order/status", element: <PublicOrderStatus /> },
  { path: "/order/status/:orderId", element: <PublicOrderStatus /> },
  { path: "/login", element: <Login /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "*", element: <NotFound /> },
];
