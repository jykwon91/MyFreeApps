import Skeleton from "@/shared/components/ui/Skeleton";
import { TRANSACTION_SKELETON_COLUMN_WIDTHS } from "@/shared/lib/transaction-skeleton-columns";
import TransactionSkeletonRows from "@/app/features/transactions/TransactionSkeletonRows";

export default function TransactionsSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden md:flex md:flex-col md:min-h-0 md:flex-1">
      <div className="md:flex-1 md:overflow-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-muted text-muted-foreground border-b">
            <tr>
              {TRANSACTION_SKELETON_COLUMN_WIDTHS.map((width, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <Skeleton className={`h-3 ${width}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TransactionSkeletonRows />
          </tbody>
        </table>
      </div>
    </div>
  );
}
