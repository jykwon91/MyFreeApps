import { Navigate } from "react-router-dom";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import type { Role } from "@/shared/types/user/role";

interface RequireRoleProps {
  roles: Role[];
  children: React.ReactNode;
}

export default function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, isLoading, isError, error } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </div>
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
