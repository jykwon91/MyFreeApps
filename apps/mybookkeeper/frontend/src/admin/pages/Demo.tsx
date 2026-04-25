import { useState } from "react";
import { Plus } from "lucide-react";
import {
  useListDemoUsersQuery,
  useCreateTaggedDemoMutation,
  useDeleteDemoUserMutation,
  useResetDemoUserMutation,
} from "@/shared/store/demoApi";
import { useToast } from "@/shared/hooks/useToast";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import Button from "@/shared/components/ui/Button";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import DemoUserTable from "@/admin/features/demo/DemoUserTable";
import CreateDemoDialog from "@/admin/features/demo/CreateDemoDialog";
import CredentialsModal from "@/admin/features/demo/CredentialsModal";
import DemoPageSkeleton from "@/admin/features/demo/DemoPageSkeleton";

interface Credentials {
  email: string;
  password: string;
}

type ConfirmAction =
  | { type: "reset"; userId: string; tag: string }
  | { type: "delete"; userId: string; tag: string };

export default function Demo() {
  const { data: usersData, isLoading: usersLoading } =
    useListDemoUsersQuery();
  const [createTagged, { isLoading: isCreating, reset: resetCreateCache }] =
    useCreateTaggedDemoMutation();
  const [deleteUser, { isLoading: isDeleting }] = useDeleteDemoUserMutation();
  const [resetUser, { isLoading: isResetting, reset: resetResetCache }] =
    useResetDemoUserMutation();
  const { showSuccess, showError } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );

  const users = usersData?.users ?? [];

  function findTag(userId: string): string {
    return users.find((u) => u.user_id === userId)?.tag ?? "this user";
  }

  async function handleCreateTagged(tag: string, recipientEmail?: string) {
    try {
      const result = await createTagged({ tag, recipient_email: recipientEmail }).unwrap();
      setShowCreateDialog(false);
      setCredentials(result.credentials);
      resetCreateCache();
      if (result.email_sent && recipientEmail) {
        showSuccess(`Demo user created! Invite sent to ${recipientEmail}`);
      } else {
        showSuccess("Demo user created! Credentials shown below");
      }
    } catch {
      showError("Failed to create demo user");
    }
  }

  async function handleConfirm() {
    if (!confirmAction) return;

    if (confirmAction.type === "delete") {
      try {
        const result = await deleteUser(confirmAction.userId).unwrap();
        showSuccess(result.message);
      } catch {
        showError("Failed to delete demo user");
      }
    } else {
      try {
        const result = await resetUser(confirmAction.userId).unwrap();
        setCredentials({ email: result.email, password: result.password });
        resetResetCache();
        showSuccess(result.message);
      } catch {
        showError("Failed to reset demo user");
      }
    }

    setConfirmAction(null);
  }

  if (usersLoading) {
    return <DemoPageSkeleton />;
  }

  return (
    <div className="p-6 space-y-6">
      <SectionHeader
        title="Demo Management"
        subtitle="Manage demo accounts and seed data"
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Demo Users</h2>
          <p className="text-sm text-muted-foreground">
            {users.length} demo user{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus size={16} className="mr-1.5" />
          Create Demo User
        </Button>
      </div>

      <DemoUserTable
        users={users}
        onReset={(userId) =>
          setConfirmAction({ type: "reset", userId, tag: findTag(userId) })
        }
        onDelete={(userId) =>
          setConfirmAction({ type: "delete", userId, tag: findTag(userId) })
        }
      />

      <CreateDemoDialog
        open={showCreateDialog}
        isLoading={isCreating}
        onSubmit={handleCreateTagged}
        onCancel={() => setShowCreateDialog(false)}
      />

      {credentials && (
        <CredentialsModal
          open
          email={credentials.email}
          password={credentials.password}
          onClose={() => setCredentials(null)}
        />
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.type === "delete"
            ? "Delete demo user?"
            : "Reset demo user?"
        }
        description={
          confirmAction?.type === "delete"
            ? `This will permanently delete "${confirmAction.tag}" and all their data. This cannot be undone.`
            : `Reset will wipe all data for "${confirmAction?.tag ?? ""}" and generate a new password. Continue?`
        }
        confirmLabel={confirmAction?.type === "delete" ? "Delete" : "Reset"}
        variant={confirmAction?.type === "delete" ? "danger" : "default"}
        isLoading={isDeleting || isResetting}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
