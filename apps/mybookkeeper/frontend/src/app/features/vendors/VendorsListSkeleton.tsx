import Skeleton from "@/shared/components/ui/Skeleton";

export interface VendorsListSkeletonProps {
  count?: number;
}

/**
 * Skeleton loader for the Vendors rolodex.
 *
 * Mirrors the loaded layout exactly per ``feedback_skeletons_match_layout``:
 *   - Mobile: same number of card slots (default 4) with the same internal
 *     row structure (name + category badge, rate + last used).
 *   - Desktop: same 4 columns (Name, Category, Hourly Rate, Last Used) and
 *     same number of skeleton rows.
 */
export default function VendorsListSkeleton({ count = 4 }: VendorsListSkeletonProps) {
  const rows = Array.from({ length: count }, (_, i) => i);

  return (
    <div data-testid="vendors-skeleton">
      {/* Mobile: card list */}
      <ul className="md:hidden space-y-3">
        {rows.map((i) => (
          <li key={`m-${i}`} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
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
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Hourly Rate</th>
              <th className="px-4 py-2">Last Used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={`d-${i}`} className="border-t">
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
