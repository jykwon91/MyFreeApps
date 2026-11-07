import Skeleton from "@/shared/components/ui/Skeleton";
import DocumentCardSkeleton from "@/app/features/documents/DocumentCardSkeleton";

// On phones, mirrors DocumentTable's card list; from md up, its 7-column table:
// checkbox | status | file | type | source | uploaded | actions
const COLUMNS = [
  { width: "w-4" }, // checkbox
  { width: "w-16" }, // status badge
  { width: "w-40" }, // file name
  { width: "w-14" }, // type
  { width: "w-16" }, // source badge
  { width: "w-28" }, // uploaded (relative date)
  { width: "w-6" }, // delete action
];

export default function DocumentsSkeleton() {
  return (
    <>
      <div className="md:hidden divide-y border rounded-lg overflow-hidden">
        {Array.from({ length: 10 }, (_, i) => (
          <DocumentCardSkeleton key={i} />
        ))}
      </div>
      <div className="hidden md:block md:flex-1 md:overflow-auto">
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
            {Array.from({ length: 10 }, (_, row) => (
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
    </>
  );
}
