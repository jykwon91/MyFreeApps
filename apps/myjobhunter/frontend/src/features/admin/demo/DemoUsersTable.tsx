import { Trash2 } from "lucide-react";
import { formatDate } from "@platform/ui";
import type { DemoUser } from "@/types/demo/demo-user";

interface DemoUsersTableProps {
  users: DemoUser[];
  onDelete: (user: DemoUser) => void;
}

/**
 * Tabular list of demo accounts. The action column shows a single
 * Delete button per row — there's no Reset (MJH demo accounts are
 * cheap to recreate; delete + create is simpler than reset).
 *
 * Mobile: the Created column hides on small screens (sm:table-cell)
 * so the row stays readable. Touch targets meet the 44x44 minimum.
 */
export default function DemoUsersTable({
  users,
  onDelete,
}: DemoUsersTableProps) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Name</th>
            <th className="text-left px-4 py-3 font-medium">Email</th>
            <th className="text-right px-4 py-3 font-medium tabular-nums">
              Apps
            </th>
            <th className="text-right px-4 py-3 font-medium tabular-nums">
              Companies
            </th>
            <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">
              Created
            </th>
            <th className="text-right px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.user_id}
              className="border-b last:border-b-0"
              data-testid="demo-user-row"
            >
              <td className="px-4 py-3 font-medium">{user.display_name}</td>
              <td className="px-4 py-3 text-muted-foreground font-mono text-xs break-all">
                {user.email}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {user.application_count}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {user.company_count}
              </td>
              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                {formatDate(user.created_at)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => onDelete(user)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] min-w-[44px] justify-center"
                    aria-label={`Delete ${user.email}`}
                    title="Delete demo account"
                  >
                    <Trash2 size={14} />
                    <span className="hidden md:inline">Delete</span>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
