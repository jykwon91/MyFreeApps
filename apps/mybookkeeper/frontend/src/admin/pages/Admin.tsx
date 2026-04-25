import { useMemo, useState } from "react";
import {
  useListUsersQuery,
  useUpdateUserRoleMutation,
  useDeactivateUserMutation,
  useActivateUserMutation,
  useGetPlatformStatsQuery,
  useListOrgsQuery,
  useToggleSuperuserMutation,
} from "@/shared/store/adminApi";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { useToast } from "@/shared/hooks/useToast";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import type { Role } from "@/shared/types/user/role";
import UsersTable from "@/admin/features/users/UsersTable";
import StatsCards from "@/admin/features/users/StatsCards";
import OrgsTable from "@/admin/features/organizations/OrgsTable";
import AdminPageSkeleton from "@/admin/features/AdminPageSkeleton";

type Tab = "users" | "organizations";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "users", label: "Users" },
  { value: "organizations", label: "Organizations" },
];

export default function Admin() {
  const { data: users, isLoading: usersLoading } = useListUsersQuery();
  const { data: stats, isLoading: statsLoading } = useGetPlatformStatsQuery();
  const { data: orgs, isLoading: orgsLoading } = useListOrgsQuery();
  const { user: currentUser } = useCurrentUser();
  const [updateRole, { isLoading: isUpdatingRole }] = useUpdateUserRoleMutation();
  const [deactivate, { isLoading: isDeactivating }] = useDeactivateUserMutation();
  const [activate, { isLoading: isActivating }] = useActivateUserMutation();
  const [toggleSuperuser, { isLoading: isTogglingSuper }] = useToggleSuperuserMutation();
  const { showSuccess, showError } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    type: "deactivate" | "activate" | "superuser";
    userId: string;
    email: string;
  } | null>(null);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name?.toLowerCase().includes(q) ?? false),
    );
  }, [users, searchQuery]);

  if (usersLoading || statsLoading || orgsLoading) {
    return <AdminPageSkeleton />;
  }

  async function handleRoleChange(userId: string, role: Role) {
    try {
      await updateRole({ userId, role }).unwrap();
      showSuccess("Role updated");
    } catch {
      showError("Failed to update role");
    }
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === "deactivate") {
        await deactivate(confirmAction.userId).unwrap();
        showSuccess("User deactivated");
      } else if (confirmAction.type === "activate") {
        await activate(confirmAction.userId).unwrap();
        showSuccess("User activated");
      } else {
        await toggleSuperuser(confirmAction.userId).unwrap();
        showSuccess("Superuser status updated");
      }
    } catch {
      showError(`Failed to ${confirmAction.type} user`);
    } finally {
      setConfirmAction(null);
    }
  }

  function getConfirmTitle(): string {
    if (!confirmAction) return "";
    if (confirmAction.type === "superuser") return "Toggle superuser?";
    return `${confirmAction.type === "deactivate" ? "Deactivate" : "Activate"} user?`;
  }

  function getConfirmDescription(): string {
    if (!confirmAction) return "";
    if (confirmAction.type === "superuser") {
      return `Are you sure you want to toggle superuser status for ${confirmAction.email}?`;
    }
    return `Are you sure you want to ${confirmAction.type} ${confirmAction.email}?`;
  }

  return (
    <div className="p-6 space-y-6">
      <SectionHeader title="Admin" subtitle="Platform administration" />

      <StatsCards stats={stats} isLoading={statsLoading} />

      <div className="border-b">
        <nav className="flex gap-4" role="tablist">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "users" ? (
        <UsersTable
          users={filteredUsers}
          isLoading={usersLoading}
          currentUserId={currentUser?.id ?? ""}
          isSuperuser={currentUser?.is_superuser ?? false}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRoleChange={handleRoleChange}
          onConfirmAction={setConfirmAction}
          isUpdatingRole={isUpdatingRole}
        />
      ) : (
        <OrgsTable orgs={orgs ?? []} isLoading={orgsLoading} />
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title={getConfirmTitle()}
        description={getConfirmDescription()}
        confirmLabel={
          confirmAction?.type === "deactivate"
            ? "Deactivate"
            : confirmAction?.type === "superuser"
              ? "Confirm"
              : "Activate"
        }
        variant={confirmAction?.type === "deactivate" ? "danger" : "default"}
        isLoading={isDeactivating || isActivating || isTogglingSuper}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
