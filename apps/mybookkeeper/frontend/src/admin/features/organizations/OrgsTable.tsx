import Skeleton from "@/shared/components/ui/Skeleton";
import { format } from "date-fns/format";
import { parseISO } from "date-fns/parseISO";

interface OrgRow {
  id: string;
  name: string;
  owner_email: string | null;
  created_at: string;
  member_count: number;
  transaction_count: number;
}

interface OrgsTableProps {
  orgs: OrgRow[];
  isLoading: boolean;
}

function formatDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}

export default function OrgsTable({ orgs, isLoading }: OrgsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Name</th>
            <th className="text-left px-4 py-3 font-medium">Owner</th>
            <th className="text-left px-4 py-3 font-medium">Members</th>
            <th className="text-left px-4 py-3 font-medium">Transactions</th>
            <th className="text-left px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.id} className="border-b last:border-b-0">
              <td className="px-4 py-3 font-medium">{org.name}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {org.owner_email ?? "\u2014"}
              </td>
              <td className="px-4 py-3">{org.member_count}</td>
              <td className="px-4 py-3">{org.transaction_count}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(org.created_at)}
              </td>
            </tr>
          ))}
          {orgs.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                No organizations found
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
