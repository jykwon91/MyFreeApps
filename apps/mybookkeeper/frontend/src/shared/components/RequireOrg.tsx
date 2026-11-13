import { useLayoutEffect } from "react";
import { useDispatch } from "react-redux";
import { Navigate } from "react-router-dom";
import { LoadingButton, StandaloneMain } from "@platform/ui";
import { useListOrganizationsQuery } from "@mybookkeeper/api-client/store/organizationsApi";
import { useGetTaxProfileQuery } from "@/shared/store/taxProfileApi";
import { setActiveOrg, setOrganizations } from "@/shared/store/organizationSlice";
import { useActiveOrgId, useCurrentOrg } from "@/shared/hooks/useCurrentOrg";
import type { AppDispatch } from "@/shared/store";
import type { ApiError } from "@/shared/types/api-error";
import RequireOrgSkeleton from "@/shared/components/RequireOrgSkeleton";
import CreateOrgPrompt from "@/app/features/organizations/CreateOrgPrompt";

export interface RequireOrgProps {
  children: React.ReactNode;
}

export default function RequireOrg({ children }: RequireOrgProps) {
  const dispatch = useDispatch<AppDispatch>();
  const {
    data: orgs,
    isLoading: orgsLoading,
    isFetching,
    error,
    refetch,
  } = useListOrganizationsQuery();
  const { data: taxProfile } = useGetTaxProfileQuery(undefined, {
    skip: !orgs || orgs.length === 0,
  });
  const activeOrgId = useActiveOrgId();
  const currentOrg = useCurrentOrg();

  // Layout effect: sync before paint, so a refetched role never shows stale.
  useLayoutEffect(() => {
    if (!orgs) return;
    dispatch(setOrganizations(orgs));
    if (!activeOrgId && orgs.length > 0) {
      dispatch(setActiveOrg(orgs[0].id));
    }
  }, [orgs, dispatch, activeOrgId]);

  // Only show the full-page loading skeleton on initial load (no orgs data yet).
  // On org switches, let child pages handle their own loading states.
  if (orgsLoading && !orgs) {
    return <RequireOrgSkeleton />;
  }

  // API error — distinguish auth failures from other errors. The error state
  // is shown in place of Layout, so it brings the page's main landmark.
  // On 401, RequireAuth's reactive subscription will redirect to /login.
  // For other errors, show a recoverable error state instead of CreateOrgPrompt.
  // Reads `error`, not `isError`: RTK clears `isError` while a retry is in
  // flight but keeps `error`, so the error state holds through the retry
  // instead of falling through to CreateOrgPrompt (no orgs loaded yet) or
  // flashing the pages (orgs loaded from before).
  if (error) {
    const apiError = error as ApiError;
    if (apiError?.status === 401) {
      return <Navigate to="/login" replace />;
    }
    return (
      <StandaloneMain>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-destructive text-lg">
              Something went wrong loading your organizations.
            </p>
            <LoadingButton
              type="button"
              isLoading={isFetching}
              loadingText="Retrying..."
              onClick={() => refetch()}
            >
              Try again
            </LoadingButton>
          </div>
        </div>
      </StandaloneMain>
    );
  }

  // Shown in place of Layout, so it brings the page's main landmark.
  if (!orgs || orgs.length === 0) {
    return (
      <StandaloneMain>
        <CreateOrgPrompt />
      </StandaloneMain>
    );
  }

  // Wait until the active workspace is in the store, so pages always know
  // the member's role and never show write controls to a viewer.
  if (!currentOrg) {
    return <RequireOrgSkeleton />;
  }

  if (taxProfile && !taxProfile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
