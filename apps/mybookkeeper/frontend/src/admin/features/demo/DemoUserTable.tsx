import { RotateCcw, Trash2 } from "lucide-react";
import type { DemoUser } from "@/shared/types/demo/demo-user";
import { formatDate } from "@/shared/utils/date";

export interface DemoUserTableProps {
  users: DemoUser[];
  onReset: (userId: string) => void;
  onDelete: (userId: string) => void;
}

export default function DemoUserTable({ users, onReset, onDelete }: DemoUserTableProps) {
  if (users.length === 0) {
    return (
      <div className="border rounded-lg px-6 py-12 text-center">
        <p className="text-muted-foreground text-sm">
          No demo users yet. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Tag</th>
            <th className="text-left px-4 py-3 font-medium">Email</th>
            <th className="text-left px-4 py-3 font-medium">Uploads</th>
            <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Created</th>
            <th className="text-right px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.user_id} className="border-b last:border-b-0">
              <td className="px-4 py-3 font-medium">{user.tag}</td>
              <td className="px-4 py-3 text-muted-foreground font-mono text-xs break-all">
                {user.email}
              </td>
              <td className="px-4 py-3 tabular-nums">{user.upload_count}</td>
              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                {formatDate(user.created_at)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onReset(user.user_id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md hover:bg-muted transition-colors min-h-[36px] min-w-[36px] justify-center"
                    aria-label={`Reset ${user.tag}`}
                    title="Reset data & password"
                  >
                    <RotateCcw size={14} />
                    <span className="hidden md:inline">Reset</span>
                  </button>
                  <button
                    onClick={() => onDelete(user.user_id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors min-h-[36px] min-w-[36px] justify-center"
                    aria-label={`Delete ${user.tag}`}
                    title="Delete demo user"
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
