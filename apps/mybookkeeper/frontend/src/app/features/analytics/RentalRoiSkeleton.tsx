import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";

const ROWS = [0, 1, 2];
const COLUMNS = [0, 1, 2, 3, 4];

/** Mirrors the loaded tab: headline, target input, help line, then cards (phone) or the table. */
export default function RentalRoiSkeleton() {
  return (
    <div className="space-y-6" data-testid="rental-roi-skeleton">
      <div
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        data-testid="rental-roi-skeleton-headline"
      >
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-6">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3" data-testid="rental-roi-skeleton-input">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-11 w-24" />
        </div>
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="space-y-3 md:hidden" data-testid="rental-roi-skeleton-cards">
        {[...ROWS, ROWS.length].map((i) => (
          <Card key={i} className="p-4 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-full" />
          </Card>
        ))}
      </div>

      <Card className="hidden md:block p-0">
        <table className="w-full" data-testid="rental-roi-skeleton-table">
          <thead>
            <tr className="border-b">
              {COLUMNS.map((i) => (
                <th key={i} className="py-3 px-6">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row} className="border-b" data-testid="rental-roi-skeleton-row">
                {COLUMNS.map((i) => (
                  <td key={i} className="py-4 px-6">
                    <Skeleton className="h-4 w-20" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40" data-testid="rental-roi-skeleton-total-row">
              {COLUMNS.map((i) => (
                <td key={i} className="py-4 px-6">
                  <Skeleton className="h-4 w-20" />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
