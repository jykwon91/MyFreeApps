import Skeleton from "@/shared/components/ui/Skeleton";
import Badge from "@/shared/components/ui/Badge";
import type { Role } from "@/shared/types/user/role";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
}

interface ConfirmAction {
  type: "deactivate" | "activate" | "superuser";
  userId: string;
  email: string;
}

interface UsersTableProps {
  users: UserRow[];
  isLoading: boolean;
  currentUserId: string;
  isSuperuser: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRoleChange: (userId: string, role: Role) => void;
  onConfirmAction: (action: ConfirmAction) => void;
  isUpdatingRole?: boolean;
}

export default function UsersTable({
  users,
  isLoading,
  currentUserId,
  isSuperuser,
  searchQuery,
  onSearchChange,
  onRoleChange,
  onConfirmAction,
  isUpdatingRole = false,
}: UsersTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search by email or name..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="border rounded px-3 py-2 text-sm bg-background w-full max-w-sm"
      />

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Superuser</th>
              <th className="text-left px-4 py-3 font-medium">Verified</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.name ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-muted-foreground capitalize">
                        {u.role}
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) =>
                          onRoleChange(u.id, e.target.value as Role)
                        }
                        disabled={isUpdatingRole}
                        className="border rounded px-2 py-1 text-sm bg-background disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_superuser ? (
                      <Badge label="Superuser" color="orange" />
                    ) : (
                      <span className="text-muted-foreground text-xs">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_verified ? (
                      <Badge label="Verified" color="green" />
                    ) : (
                      <Badge label="Unverified" color="gray" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.is_active
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400"
                      }
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {!isSelf &&
                        (u.is_active ? (
                          <button
                            onClick={() =>
                              onConfirmAction({
                                type: "deactivate",
                                userId: u.id,
                                email: u.email,
                              })
                            }
                            className="text-sm text-red-600 hover:text-red-700"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              onConfirmAction({
                                type: "activate",
                                userId: u.id,
                                email: u.email,
                              })
                            }
                            className="text-sm text-green-600 hover:text-green-700"
                          >
                            Activate
                          </button>
                        ))}
                      {!isSelf && isSuperuser ? (
                        <button
                          onClick={() =>
                            onConfirmAction({
                              type: "superuser",
                              userId: u.id,
                              email: u.email,
                            })
                          }
                          className="text-sm text-orange-600 hover:text-orange-700"
                        >
                          {u.is_superuser ? "Revoke SU" : "Grant SU"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No users found
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
