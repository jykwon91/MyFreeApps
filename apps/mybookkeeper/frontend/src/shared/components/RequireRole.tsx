import { Navigate } from "react-router-dom";
import { StandaloneMain } from "@platform/ui";
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
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-6 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </StandaloneMain>
    );
  }

  if (isError) {
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
