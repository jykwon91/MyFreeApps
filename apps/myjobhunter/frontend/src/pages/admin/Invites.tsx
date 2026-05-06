import { useState } from "react";
import { Plus } from "lucide-react";
import CreateInviteDialog from "@/features/admin/invites/CreateInviteDialog";
import InvitesList from "@/features/admin/invites/InvitesList";

/**
 * Superuser Invites page.
 *
 * The route is wrapped by `<RequireSuperuser>` in `routes.tsx`, which
 * handles the loading skeleton + redirect for non-superusers. Here we
 * just assume the gate has already passed.
 *
 * The server-side `current_superuser` dependency is the actual
 * security boundary — every admin-only invite endpoint validates
 * server-side.
 */
export default function AdminInvites() {
  const [createOpen, setCreateOpen] = useState(false);

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
