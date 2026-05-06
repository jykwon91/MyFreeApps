import { useIsAuthenticated } from "@platform/ui";
import { useGetCurrentUserQuery } from "@/lib/userApi";
import { ROLE } from "@/constants/roles";

interface UseIsAdminResult {
  /** True only when the loaded user has Role.ADMIN. False during loading. */
  isAdmin: boolean;
  /** True while the /users/me request is in flight. */
  isLoading: boolean;
}

/**
 * Resolve the current user's admin status from `/users/me`.
 *
 * Skips the network request when the user is not authenticated so
 * unauthenticated routes (e.g. /login) don't trigger a 401 storm.
 * Returns `isAdmin=false` while loading so callers default to the
 * non-admin UI; the redirect / hide-link decision happens AFTER the
 * data resolves. Callers that need to gate routing should also
 * handle the loading state explicitly (see `RequireAdmin`).
 */
export function useIsAdmin(): UseIsAdminResult {
  const isAuthenticated = useIsAuthenticated();
  const { data, isLoading } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });
  return {
    isAdmin: isAuthenticated && data?.role === ROLE.ADMIN,
    isLoading: isAuthenticated && isLoading,
  };
}
