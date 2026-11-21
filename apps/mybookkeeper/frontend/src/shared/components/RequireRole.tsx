import { Navigate } from "react-router-dom";
import { LoadingRegion, StandaloneMain } from "@platform/ui";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import type { Role } from "@/shared/types/user/role";

interface RequireRoleProps {
  roles: Role[];
  children: React.ReactNode;
}

export default function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, isLoading, isError, error } = useCurrentUser();

  // Guards /admin, outside every shell, so its skeleton brings the main landmark.
  if (isLoading) {
    return (
      <StandaloneMain>
        <LoadingRegion label="Loading page…" className="p-6 space-y-4 animate-pulse">
          <div className="h-6 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </LoadingRegion>
      </StandaloneMain>
    );
  }

  // A failed refetch of a user already loaded keeps them on the page, unless it says they're signed out.
  if (isError && (!user || error?.status === 401)) {
    if (error?.status === 401) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to="/forbidden" replace />;
  }

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
