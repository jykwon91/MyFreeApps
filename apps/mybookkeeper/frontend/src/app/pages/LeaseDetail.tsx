import { useParams } from "react-router-dom";
import LeaseDetailBody from "@/app/features/leases/LeaseDetailBody";

// Keyed on the lease id so every piece of per-lease state (notes editor, tab,
// dialogs) remounts when navigating between leases (e.g. prior/successor).
export default function LeaseDetail() {
  const { leaseId } = useParams<{ leaseId: string }>();
  return <LeaseDetailBody key={leaseId} leaseId={leaseId} />;
}
