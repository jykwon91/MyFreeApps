import { Navigate, type RouteObject } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import Applications from "@/pages/Applications";
import ApplicationDetail from "@/pages/ApplicationDetail";
import Companies from "@/pages/Companies";
import CompanyDetail from "@/pages/CompanyDetail";
import Documents from "@/pages/Documents";
import Profile from "@/pages/Profile";
import ResumeRefinement from "@/pages/ResumeRefinement";
import Security from "@/pages/Security";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import VerifyEmail from "@/pages/VerifyEmail";
import NotFound from "@/pages/NotFound";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import DemoUsers from "@/pages/admin/DemoUsers";
import AdminInvites from "@/pages/admin/Invites";
import RootLayout from "@/RootLayout";
import RequireSuperuser from "@/components/RequireSuperuser";
import { ADMIN_ROUTES } from "@/constants/admin-routes";

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/applications", element: <Applications /> },
      { path: "/applications/:id", element: <ApplicationDetail /> },
      { path: "/companies", element: <Companies /> },
      { path: "/companies/:id", element: <CompanyDetail /> },
      { path: "/documents", element: <Documents /> },
      { path: "/resume", element: <ResumeRefinement /> },
      { path: "/profile", element: <Profile /> },
      { path: "/settings", element: <Settings /> },
      { path: "/security", element: <Security /> },
      {
        path: ADMIN_ROUTES.DASHBOARD,
        element: (
          <RequireSuperuser>
            <AdminDashboard />
          </RequireSuperuser>
        ),
      },
      {
        path: ADMIN_ROUTES.DEMO_USERS,
        element: (
          <RequireSuperuser>
            <DemoUsers />
          </RequireSuperuser>
        ),
      },
      {
        path: ADMIN_ROUTES.INVITES,
        element: (
          <RequireSuperuser>
            <AdminInvites />
          </RequireSuperuser>
        ),
      },
    ],
  },
  { path: "/login", element: <Login /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "*", element: <NotFound /> },
];
