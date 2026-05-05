import Skeleton from "@/shared/components/ui/Skeleton";

export interface TenantsListSkeletonProps {
  count?: number;
}

/**
 * Skeleton loader for the Tenants list.
 *
 * Mirrors the loaded layout exactly:
 *   - Mobile: card slots with name + status badge, contract dates / created
 *   - Desktop: 4 columns (Name, Contract Dates, Since, Status)
 */
export default function TenantsListSkeleton({ count = 4 }: TenantsListSkeletonProps) {
  const rows = Array.from({ length: count }, (_, i) => i);

  return (
    <div data-testid="tenants-skeleton">
      {/* Mobile: card list */}
      <ul className="md:hidden space-y-3">
        {rows.map((i) => (
          <li key={`m-${i}`} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Contract Dates</th>
              <th className="px-4 py-2">Since</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={`d-${i}`} className="border-t">
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
