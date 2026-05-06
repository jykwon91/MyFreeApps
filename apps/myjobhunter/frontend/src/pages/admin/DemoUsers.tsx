import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import {
  EmptyState,
  extractErrorMessage,
  showError,
  showSuccess,
} from "@platform/ui";
import {
  useCreateDemoUserMutation,
  useDeleteDemoUserMutation,
  useListDemoUsersQuery,
} from "@/lib/demoUsersApi";
import CreateDemoDialog from "@/features/admin/demo/CreateDemoDialog";
import CredentialsModal from "@/features/admin/demo/CredentialsModal";
import DeleteDemoConfirmDialog from "@/features/admin/demo/DeleteDemoConfirmDialog";
import DemoUsersEmptyState from "@/features/admin/demo/DemoUsersEmptyState";
import DemoUsersSkeleton from "@/features/admin/demo/DemoUsersSkeleton";
import DemoUsersTable from "@/features/admin/demo/DemoUsersTable";
import type { DemoCredentials } from "@/types/demo/demo-credentials";
import type { DemoUser } from "@/types/demo/demo-user";

export default function DemoUsers() {
  const { data, isLoading, isError, error } = useListDemoUsersQuery();
  const [createDemoUser, { isLoading: isCreating }] =
    useCreateDemoUserMutation();
  const [deleteDemoUser, { isLoading: isDeleting }] =
    useDeleteDemoUserMutation();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [credentials, setCredentials] = useState<DemoCredentials | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DemoUser | null>(null);

  async function handleCreate(input: {
    email?: string;
    displayName?: string;
  }) {
    try {
      const result = await createDemoUser({
        email: input.email,
        display_name: input.displayName,
      }).unwrap();
      setShowCreateDialog(false);
      setCredentials(result.credentials);
      showSuccess("Demo account created — credentials shown below.");
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Failed to create demo account.");
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) {
      return;
    }
    try {
      await deleteDemoUser(pendingDelete.user_id).unwrap();
      showSuccess(`Deleted ${pendingDelete.email}.`);
      setPendingDelete(null);
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Failed to delete demo account.");
    }
  }

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <DemoUsersSkeleton />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EmptyState
          icon={<Sparkles className="w-12 h-12 text-destructive" />}
          heading="Couldn't load demo accounts"
          body={
            error && typeof error === "object" && "status" in error
              ? `The server returned ${(error as { status: number }).status}. Try refreshing.`
              : "Try refreshing the page."
          }
        />
      </main>
    );
  }

  const users = data?.users ?? [];

  if (users.length === 0) {
    return (
      <>
        <main className="p-4 sm:p-8 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold">Demo accounts</h1>
            <p className="text-sm text-muted-foreground">
              Showcase MyJobHunter with realistic seeded data — no manual
              setup required.
            </p>
          </header>
          <DemoUsersEmptyState
            onCreate={() => setShowCreateDialog(true)}
          />
        </main>
        <CreateDemoDialog
          open={showCreateDialog}
          isLoading={isCreating}
          onSubmit={handleCreate}
          onCancel={() => setShowCreateDialog(false)}
        />
        {credentials && (
          <CredentialsModal
            open
            credentials={credentials}
            onClose={() => setCredentials(null)}
          />
        )}
      </>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Demo accounts</h1>
        <p className="text-sm text-muted-foreground">
          Showcase MyJobHunter with realistic seeded data — no manual setup
          required.
        </p>
      </header>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {users.length} demo account{users.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-[44px]"
        >
          <Plus size={16} />
          Create demo account
        </button>
      </div>

      <DemoUsersTable
        users={users}
        onDelete={(user) => setPendingDelete(user)}
      />

      <CreateDemoDialog
        open={showCreateDialog}
        isLoading={isCreating}
        onSubmit={handleCreate}
        onCancel={() => setShowCreateDialog(false)}
      />

      {credentials && (
        <CredentialsModal
          open
          credentials={credentials}
          onClose={() => setCredentials(null)}
        />
      )}

      {pendingDelete && (
        <DeleteDemoConfirmDialog
          open
          email={pendingDelete.email}
          isLoading={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </main>
  );
}
