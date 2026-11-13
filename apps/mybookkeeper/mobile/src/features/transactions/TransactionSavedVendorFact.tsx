import { useGetVendorByIdQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import { SAVED_VENDOR_MESSAGES, TRANSACTION_FIELD_LABELS as LABELS } from "../../constants/transactionFieldLabels";
import TransactionFact from "./TransactionFact";

/** The saved vendor a transaction is linked to. A link must never read as none, even before the name loads. */
export default function TransactionSavedVendorFact({ vendorId }: { vendorId: string }) {
  const { data: vendor } = useGetVendorByIdQuery(vendorId);
  return <TransactionFact label={LABELS.savedVendor} value={vendor?.name ?? SAVED_VENDOR_MESSAGES.unknown} />;
}
