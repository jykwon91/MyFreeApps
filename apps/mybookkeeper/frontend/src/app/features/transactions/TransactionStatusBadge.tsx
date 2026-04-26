import Badge from "@/shared/components/ui/Badge";
import type { TransactionStatus } from "@/shared/types/transaction/transaction";

export default function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  switch (status) {
    case "pending":
      return <Badge label="Pending" color="yellow" />;
    case "needs_review":
      return <Badge label="Needs Review" color="orange" />;
    case "unverified":
      return <Badge label="Unverified" color="purple" />;
    case "duplicate":
      return <Badge label="Duplicate" color="red" />;
    case "approved":
      return <span className="text-green-500" title="Approved">&#10003;</span>;
    default:
      return null;
  }
}
