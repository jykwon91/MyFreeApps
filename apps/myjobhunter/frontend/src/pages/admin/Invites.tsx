import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Skeleton } from "@platform/ui";
import CreateInviteDialog from "@/features/admin/invites/CreateInviteDialog";
import InvitesList from "@/features/admin/invites/InvitesList";
import { useGetCurrentUserQuery } from "@/lib/userApi";
import { ROLE } from "@/constants/roles";

/**
 * Admin Invites page — gated on Role.ADMIN.
 *
 * The server-side `require_role(Role.ADMIN, ...)` is the security
 * boundary; this client gate is a UX nicety (renders a not-found-style
 * redirect instead of a 403 from a fetch). While the `/users/me`
 * query is in-flight we render a skeleton — never the page contents —
 * so admin-only chrome never flashes for a regular user.
 */
export default function AdminInvites() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: user, isLoading } = useGetCurrentUserQuery();

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </main>
    );
  }

  if (user?.role !== ROLE.ADMIN) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invites</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Invite someone to register on MyJobHunter by email.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm border rounded-md hover:bg-muted min-h-[44px]"
        >
          <Plus size={14} />
          Invite someone
        </button>
      </header>

      <InvitesList />

      <CreateInviteDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}
