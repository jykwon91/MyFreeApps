import Skeleton from "@/shared/components/ui/Skeleton";

export interface InquiriesSkeletonProps {
  count?: number;
}

/**
 * Skeleton loader for the Inquiries inbox.
 *
 * Mirrors the loaded layout exactly per ``feedback_skeletons_match_layout``:
 *   - Mobile: same number of card slots (default 4) with the same internal
 *     row structure (inquirer/badges, dates, employer/quality, listing/time).
 *   - Desktop: same 8 columns + same number of skeleton rows.
 */
export default function InquiriesSkeleton({ count = 4 }: InquiriesSkeletonProps) {
  const rows = Array.from({ length: count }, (_, i) => i);

  return (
    <div data-testid="inquiries-skeleton">
      {/* Mobile: card list */}
      <ul className="md:hidden space-y-3">
        {rows.map((i) => (
          <li key={`m-${i}`} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-32" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20 rounded" />
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
              <th className="px-4 py-2">Inquirer</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Desired Dates</th>
              <th className="px-4 py-2">Employer</th>
              <th className="px-4 py-2">Listing</th>
              <th className="px-4 py-2">Received</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={`d-${i}`} className="border-t">
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
