import Skeleton from "@/shared/components/ui/Skeleton";

export interface ApplicantsListSkeletonProps {
  count?: number;
}

/**
 * Skeleton loader for the Applicants list.
 *
 * Mirrors the loaded layout exactly per ``feedback_skeletons_match_layout``:
 *   - Mobile: same number of card slots (default 4) with the same internal
 *     row structure (legal name + stage badge, employer, dates / created).
 *   - Desktop: same 5 columns (Name, Employer, Contract Dates, Promoted,
 *     Stage) and same number of skeleton rows.
 */
export default function ApplicantsListSkeleton({ count = 4 }: ApplicantsListSkeletonProps) {
  const rows = Array.from({ length: count }, (_, i) => i);

  return (
    <div data-testid="applicants-skeleton">
      {/* Mobile: card list */}
      <ul className="md:hidden space-y-3">
        {rows.map((i) => (
          <li key={`m-${i}`} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-32" />
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
              <th className="px-4 py-2">Employer</th>
              <th className="px-4 py-2">Contract Dates</th>
              <th className="px-4 py-2">Promoted</th>
              <th className="px-4 py-2">Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={`d-${i}`} className="border-t">
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
