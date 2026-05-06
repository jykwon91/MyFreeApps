import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Skeleton } from "@platform/ui";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface RequireAdminProps {
  children: ReactNode;
}

/**
 * Route gate that only renders children when the current user has
 * `Role.ADMIN`. While the role lookup is in flight a skeleton is
 * shown so the UI does not flash; on resolution non-admins are
 * redirected to `/dashboard` (the same default as RequireAuth).
 *
 * The backend is still the authoritative authorization layer — every
 * admin-only route validates the role server-side. This component is
 * a UX guard, not a security control.
 */
export default function RequireAdmin({ children }: RequireAdminProps) {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </main>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
