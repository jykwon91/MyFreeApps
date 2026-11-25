import { Badge } from "@platform/ui";
import { PERSONAL_TRANSFER_LABELS } from "@mybookkeeper/api-client/constants/personalTransferLabels";
import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";

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
    case "personal_transfer":
      return <Badge label={PERSONAL_TRANSFER_LABELS.markOnCard} color="gray" />;
    case "approved":
      return <span className="text-green-500" title="Approved">&#10003;</span>;
    default:
      return null;
  }
}
