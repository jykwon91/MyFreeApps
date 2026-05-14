import { useGetCurrentUserQuery } from "@/lib/userApi";
import { useIsAuthenticated } from "@platform/ui";

export function useIsSuperuser(): { isSuperuser: boolean } {
  const isAuthenticated = useIsAuthenticated();
  const { data } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });
  return { isSuperuser: data?.is_superuser ?? false };
}
