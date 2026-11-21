import { Navigate } from "react-router-dom";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import { useOrgRole } from "@/shared/hooks/useOrgRole";
import { LoadingRegion } from "@platform/ui";

export interface RequireOrgRoleProps {
  roles: OrgRole[];
  children: React.ReactNode;
}

export default function RequireOrgRole({ roles, children }: RequireOrgRoleProps) {
  const currentRole = useOrgRole();

  if (!currentRole) {
    return (
      <LoadingRegion label="Loading page…" className="p-6 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </LoadingRegion>
    );
  }

  if (!roles.includes(currentRole)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
