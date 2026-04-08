import { useGetMeQuery } from "@/shared/store/authApi";
import type { ApiError } from "@/shared/types/api-error";
import type { Role } from "@/shared/types/user/role";

export function useCurrentUser() {
  const { data: user, isLoading, isError, error } = useGetMeQuery();
  return {
    user: user ?? null,
    isLoading,
    isError,
    error: error as ApiError | undefined,
  };
}

export function useHasRole(...roles: Role[]): boolean {
  const { user } = useCurrentUser();
  if (!user) return false;
  return roles.includes(user.role);
}

export function useIsAdmin(): boolean {
  return useHasRole("admin");
}
