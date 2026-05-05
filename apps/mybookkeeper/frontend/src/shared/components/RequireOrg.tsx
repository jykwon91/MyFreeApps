import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { Navigate } from "react-router-dom";
import { useListOrganizationsQuery } from "@/shared/store/organizationsApi";
import { useGetTaxProfileQuery } from "@/shared/store/taxProfileApi";
import { setActiveOrg, setOrganizations } from "@/shared/store/organizationSlice";
import { useActiveOrgId } from "@/shared/hooks/useCurrentOrg";
import type { AppDispatch } from "@/shared/store";
import type { ApiError } from "@/shared/types/api-error";
import Skeleton from "@/shared/components/ui/Skeleton";
import CreateOrgPrompt from "@/app/features/organizations/CreateOrgPrompt";

export interface RequireOrgProps {
  children: React.ReactNode;
}

export default function RequireOrg({ children }: RequireOrgProps) {
  const dispatch = useDispatch<AppDispatch>();
  const {
    data: orgs,
    isLoading: orgsLoading,
    isError,
    error,
    refetch,
  } = useListOrganizationsQuery();
  const { data: taxProfile } = useGetTaxProfileQuery(undefined, {
    skip: !orgs || orgs.length === 0,
  });
  const activeOrgId = useActiveOrgId();

  useEffect(() => {
    if (!orgs) return;
    dispatch(setOrganizations(orgs));
    if (!activeOrgId && orgs.length > 0) {
      dispatch(setActiveOrg(orgs[0].id));
    }
  }, [orgs, dispatch, activeOrgId]);

  // Only show the full-page loading skeleton on initial load (no orgs data yet).
  // On org switches, let child pages handle their own loading states.
  if (orgsLoading && !orgs) {
    return (
      <div className="min-h-screen flex">
        {/* Sidebar skeleton */}
        <aside className="hidden md:flex w-56 bg-card border-r flex-col shrink-0">
          <div className="px-4 py-5 border-b">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="px-3 py-4 space-y-1">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </aside>
        {/* Content skeleton — dashboard layout */}
        <main className="flex-1 p-4 sm:p-8 space-y-6">
          <Skeleton className="h-8 w-36" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border rounded-lg p-6 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-32" />
              </div>
            ))}
          </div>
          <div className="border rounded-lg px-4 py-3 flex items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-36 rounded-md" />
            <div className="flex gap-2 ml-2">
              <Skeleton className="h-8 w-12 rounded-md" />
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
          <div className="border rounded-lg p-6">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-[300px] w-full rounded" />
          </div>
        </main>
      </div>
    );
  }

  // API error — distinguish auth failures from other errors.
  // On 401, RequireAuth's reactive subscription will redirect to /login.
  // For other errors, show a recoverable error state instead of CreateOrgPrompt.
  if (isError) {
    const apiError = error as ApiError;
    if (apiError?.status === 401) {
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive text-lg">
            Something went wrong loading your organizations.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!orgs || orgs.length === 0) {
    return <CreateOrgPrompt />;
  }

  if (!activeOrgId) {
    return null;
  }

  if (taxProfile && !taxProfile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
