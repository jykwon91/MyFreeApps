import { useGetVendorByIdQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { SAVED_VENDOR_MESSAGES, TRANSACTION_FIELD_LABELS as LABELS } from "../../constants/transactionFieldLabels";
import TransactionFact from "./TransactionFact";
import TransactionFactRetry from "./TransactionFactRetry";

const NOT_FOUND = 404;

/** The saved vendor a transaction is linked to. A link must never read as none, even before the name loads. */
export default function TransactionSavedVendorFact({ vendorId }: { vendorId: string }) {
  const { data: vendor, error, refetch } = useGetVendorByIdQuery(vendorId);
  if (error && httpStatus(error) !== NOT_FOUND) {
    return <TransactionFactRetry label={LABELS.savedVendor} message={SAVED_VENDOR_MESSAGES.lookupFailed} onRetry={refetch} retryLabel={SAVED_VENDOR_MESSAGES.retryLabel} />;
  }
  return <TransactionFact label={LABELS.savedVendor} value={vendor?.name ?? SAVED_VENDOR_MESSAGES.unknown} />;
}
