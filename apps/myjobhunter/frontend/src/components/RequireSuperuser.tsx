import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Skeleton } from "@platform/ui";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";

interface RequireSuperuserProps {
  children: ReactNode;
}

/**
 * Route gate that only renders children when the current user has
 * `is_superuser=true`. While the lookup is in-flight a skeleton is
 * shown so the UI does not flash; on resolution non-superusers are
 * redirected to `/dashboard`.
 *
 * The backend (`current_superuser` dependency) is the authoritative
 * authorization layer — every admin-only endpoint validates server-
 * side. This component is a UX guard, not a security control.
 */
export default function RequireSuperuser({ children }: RequireSuperuserProps) {
  const { isSuperuser, isLoading } = useIsSuperuser();

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </main>
    );
  }

  if (!isSuperuser) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
