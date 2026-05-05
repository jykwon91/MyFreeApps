import { Navigate } from "react-router-dom";
import type { OrgRole } from "@/shared/types/organization/org-role";
import { useOrgRole } from "@/shared/hooks/useOrgRole";

export interface RequireOrgRoleProps {
  roles: OrgRole[];
  children: React.ReactNode;
}

export default function RequireOrgRole({ roles, children }: RequireOrgRoleProps) {
  const currentRole = useOrgRole();

  if (!currentRole) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (!roles.includes(currentRole)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
