import Skeleton from "@/shared/components/ui/Skeleton";

// Mirrors the 10-column table from useTransactionColumns:
// select | status | date | vendor | amount | type | category | property | tax_relevant | actions
const COLUMNS = [
  { width: "w-4" },     // select checkbox
  { width: "w-20" },    // status badge
  { width: "w-24" },    // date
  { width: "w-32" },    // vendor
  { width: "w-20" },    // amount
  { width: "w-16" },    // type badge
  { width: "w-24" },    // category badge
  { width: "w-28" },    // property
  { width: "w-8" },     // tax relevant
  { width: "w-12" },    // actions
];

export default function TransactionsSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden md:flex md:flex-col md:min-h-0 md:flex-1">
      <div className="md:flex-1 md:overflow-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-muted text-muted-foreground border-b">
            <tr>
              {COLUMNS.map((col, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <Skeleton className={`h-3 ${col.width}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 15 }, (_, row) => (
              <tr key={row} className="border-b">
                {COLUMNS.map((col, i) => (
                  <td key={i} className="px-4 py-3">
                    <Skeleton className={`h-3 ${col.width}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
