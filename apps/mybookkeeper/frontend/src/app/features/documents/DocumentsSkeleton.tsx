import Skeleton from "@/shared/components/ui/Skeleton";
import DocumentCardSkeleton from "@/app/features/documents/DocumentCardSkeleton";

// Mirrors DocumentTable: phone cards below md, the 7-column table from md up,
// and the pagination footer under both.
// checkbox | status | file | type | source | uploaded | actions
const COLUMNS = [
  { width: "w-4" },     // checkbox
  { width: "w-16" },    // status badge
  { width: "w-40" },    // file name
  { width: "w-14" },    // type
  { width: "w-16" },    // source badge
  { width: "w-28" },    // uploaded (relative date)
  { width: "w-6" },     // delete action
];

const ROW_COUNT = 10;

interface DocumentsSkeletonProps {
  canWrite: boolean;
}

export default function DocumentsSkeleton({ canWrite }: DocumentsSkeletonProps) {
  return (
    <div className="border rounded-lg overflow-hidden md:flex md:flex-col md:min-h-0 md:flex-1">
      <div className="md:hidden divide-y">
        {Array.from({ length: ROW_COUNT }, (_, i) => (
          <DocumentCardSkeleton key={i} canWrite={canWrite} />
        ))}
      </div>
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="text-left text-xs text-muted-foreground border-b bg-background">
            <tr>
              {COLUMNS.map((col, i) => (
                <th key={i} className="px-3 py-2">
                  <Skeleton className={`h-3 ${col.width}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROW_COUNT }, (_, row) => (
              <tr key={row} className="border-b">
                {COLUMNS.map((col, i) => (
                  <td key={i} className="px-3 py-2">
                    <Skeleton className={`h-3 ${col.width}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 shrink-0"
        data-testid="documents-skeleton-footer"
      >
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-40" />
      </div>
    </div>
  );
}
