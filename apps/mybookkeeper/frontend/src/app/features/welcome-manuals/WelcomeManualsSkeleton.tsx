import Skeleton from "@/shared/components/ui/Skeleton";

export interface WelcomeManualsSkeletonProps {
  count?: number;
}

/**
 * Skeleton loader for the Welcome Manuals list. Mirrors the loaded layout
 * exactly — same mobile card slots, same desktop table columns — to prevent
 * layout shift.
 */
export default function WelcomeManualsSkeleton({ count = 4 }: WelcomeManualsSkeletonProps) {
  const rows = Array.from({ length: count }, (_, i) => i);

  return (
    <div data-testid="welcome-manuals-skeleton">
      {/* Mobile: card list */}
      <ul className="md:hidden space-y-3">
        {rows.map((i) => (
          <li key={`m-${i}`} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-24" />
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Property</th>
              <th className="px-4 py-2">Sections</th>
              <th className="px-4 py-2 text-right">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={`d-${i}`} className="border-t">
                <td className="px-4 py-3"><Skeleton className="h-4 w-44" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-24 ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
