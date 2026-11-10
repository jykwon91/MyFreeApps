import { LEASE_IMPORT_MESSAGES as MESSAGES } from "../../constants/leaseImport";
import RequireWrite from "../workspace/RequireWrite";
import WriteAccessSkeleton from "../workspace/WriteAccessSkeleton";
import LeaseImportBody from "./LeaseImportBody";

/** Adds a lease that was signed outside the app. A viewer is told they can't. */
export default function LeaseImportScreen() {
  return (
    <RequireWrite body={MESSAGES.viewOnly} heading={MESSAGES.title} loading={<WriteAccessSkeleton />}>
      <LeaseImportBody />
    </RequireWrite>
  );
}
