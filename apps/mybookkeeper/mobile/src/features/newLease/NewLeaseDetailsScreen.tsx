import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import RequireWrite from "../workspace/RequireWrite";
import NewLeaseDetailsLoader from "./NewLeaseDetailsLoader";
import NewLeaseDetailsSkeleton from "./NewLeaseDetailsSkeleton";

/** Last step of making a lease. A viewer is told they can't, and the server is never asked what to fill in. */
export default function NewLeaseDetailsScreen({ flow }: { flow: NewLeaseFlow }) {
  return (
    <RequireWrite loading={<NewLeaseDetailsSkeleton />}>
      <NewLeaseDetailsLoader flow={flow} />
    </RequireWrite>
  );
}
