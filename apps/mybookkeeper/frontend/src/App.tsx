import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import { useIsAuthenticated } from "@/shared/lib/auth";
import Layout from "@/app/components/Layout";
import RequireRole from "@/shared/components/RequireRole";
import RequireOrg from "@/shared/components/RequireOrg";
import RequireOrgRole from "@/shared/components/RequireOrgRole";
import ErrorBoundary from "@/shared/components/ErrorBoundary";
import Toaster from "@/shared/components/ui/Toaster";
import Login from "@/app/pages/Login";
import Register from "@/app/pages/Register";
import ForgotPassword from "@/app/pages/ForgotPassword";
import ResetPassword from "@/app/pages/ResetPassword";
import InviteAccept from "@/app/pages/InviteAccept";
import VerifyEmail from "@/app/pages/VerifyEmail";
import Dashboard from "@/app/pages/Dashboard";
import Documents from "@/app/pages/Documents";
import Properties from "@/app/pages/Properties";
import Listings from "@/app/pages/Listings";
import ListingDetail from "@/app/pages/ListingDetail";
import Inquiries from "@/app/pages/Inquiries";
import InquiryDetail from "@/app/pages/InquiryDetail";
import ReplyTemplates from "@/app/pages/ReplyTemplates";
import TaxReport from "@/app/pages/TaxReport";
import Integrations from "@/app/pages/Integrations";
import Members from "@/app/pages/Members";
import Transactions from "@/app/pages/Transactions";
import Reconciliation from "@/app/pages/Reconciliation";
import TaxDocuments from "@/app/pages/TaxDocuments";
import TaxReturns from "@/app/pages/TaxReturns";
import TaxReturnDetail from "@/app/pages/TaxReturnDetail";
import Analytics from "@/app/pages/Analytics";
import Security from "@/app/pages/Security";
import Forbidden from "@/app/pages/Forbidden";
import OAuthCallback from "@/app/pages/OAuthCallback";

import PrivacyPolicy from "@/app/pages/PrivacyPolicy";
import TermsOfService from "@/app/pages/TermsOfService";
import AdminSkeleton from "@/admin/components/AdminSkeleton";
const AdminLayout = lazy(() => import("@/admin/components/AdminLayout"));
const Admin = lazy(() => import("@/admin/pages/Admin"));
const SystemHealth = lazy(() => import("@/admin/pages/SystemHealth"));
const CostMonitoring = lazy(() => import("@/admin/pages/CostMonitoring"));
const Demo = lazy(() => import("@/admin/pages/Demo"));
const UserActivity = lazy(() => import("@/admin/pages/UserActivity"));
const Onboarding = lazy(() => import("@/app/pages/Onboarding"));
const TaxReview = lazy(() => import("@/app/pages/TaxReview"));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const authenticated = useIsAuthenticated();
  return authenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Provider store={store}>
      <ErrorBoundary>
        <Toaster />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route path="/oauth-callback" element={<OAuthCallback />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                    <Onboarding />
                  </Suspense>
                </RequireAuth>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <RequireOrg>
                    <Layout />
                  </RequireOrg>
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="documents" element={<Documents />} />
              <Route path="properties" element={<Properties />} />
              <Route path="listings" element={<Listings />} />
              <Route path="listings/:listingId" element={<ListingDetail />} />
              <Route path="inquiries" element={<Inquiries />} />
              <Route path="inquiries/:inquiryId" element={<InquiryDetail />} />
              <Route path="reply-templates" element={<ReplyTemplates />} />
              <Route path="reconciliation" element={<Reconciliation />} />
              <Route path="tax" element={<TaxReport />} />
              <Route path="tax-documents" element={<TaxDocuments />} />
              <Route path="tax-returns" element={<TaxReturns />} />
              <Route path="tax-returns/:id" element={<TaxReturnDetail />} />
              <Route path="analytics" element={<Analytics />} />
              <Route
                path="tax-review"
                element={
                  <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                    <TaxReview />
                  </Suspense>
                }
              />
              <Route path="integrations" element={<Integrations />} />
              <Route path="security" element={<Security />} />
              <Route
                path="members"
                element={
                  <RequireOrgRole roles={["owner", "admin"]}>
                    <Members />
                  </RequireOrgRole>
                }
              />
              <Route path="forbidden" element={<Forbidden />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <RequireRole roles={["admin"]}>
                    <Suspense fallback={<AdminSkeleton />}>
                      <AdminLayout />
                    </Suspense>
                  </RequireRole>
                </RequireAuth>
              }
            >
              <Route index element={<Admin />} />
              <Route path="system-health" element={<SystemHealth />} />
              <Route path="costs" element={<CostMonitoring />} />
              <Route path="user-activity" element={<UserActivity />} />
              <Route path="demo" element={<Demo />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </Provider>
  );
}
