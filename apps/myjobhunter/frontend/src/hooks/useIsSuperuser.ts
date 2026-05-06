import { useIsAuthenticated } from "@platform/ui";
import { useGetCurrentUserQuery } from "@/lib/userApi";

interface UseIsSuperuserResult {
  /** True only when the loaded user has is_superuser=true. False during loading. */
  isSuperuser: boolean;
  /** True while the /users/me request is in flight. */
  isLoading: boolean;
}

/**
 * Resolve the current user's superuser status from `/users/me`.
 *
 * MJH does not have a multi-tier admin role — the operator is the only
 * superuser; everyone else is a regular user. This hook is the single
 * source of truth for the SPA on whether to show the Admin section
 * (dashboard, demo accounts, invites).
 *
 * Skips the network request when the user is not authenticated so
 * unauthenticated routes don't trigger a 401 storm. Returns
 * `isSuperuser=false` while loading so callers default to the non-admin
 * UI; the redirect / hide-link decision happens AFTER the data
 * resolves. Callers that need to gate routing should also handle the
 * loading state explicitly (see `RequireSuperuser`).
 */
export function useIsSuperuser(): UseIsSuperuserResult {
  const isAuthenticated = useIsAuthenticated();
  const { data, isLoading } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });
  return {
    isSuperuser: isAuthenticated && (data?.is_superuser ?? false),
    isLoading: isAuthenticated && isLoading,
  };
}
