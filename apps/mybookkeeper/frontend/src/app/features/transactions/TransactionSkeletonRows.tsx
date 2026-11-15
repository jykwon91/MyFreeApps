import Skeleton from "@/shared/components/ui/Skeleton";
import {
  TRANSACTION_SKELETON_COLUMN_WIDTHS,
  TRANSACTION_SKELETON_ROW_COUNT,
} from "@/shared/lib/transaction-skeleton-columns";

/** Placeholder table rows, one cell per transaction column. */
export default function TransactionSkeletonRows() {
  return (
    <>
      {Array.from({ length: TRANSACTION_SKELETON_ROW_COUNT }, (_, row) => (
        <tr key={row} className="border-b" data-testid="transaction-skeleton-row">
          {TRANSACTION_SKELETON_COLUMN_WIDTHS.map((width, i) => (
            <td key={i} className="px-4 py-3">
              <Skeleton className={`h-3 ${width}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
