import { NEW_LEASE_MESSAGES } from "../../constants/newLease";
import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import ApplicantsSkeleton from "../applicants/ApplicantsSkeleton";
import RequireWrite from "../workspace/RequireWrite";
import ApplicantPickerList from "./ApplicantPickerList";

/** Second step of making a lease. A viewer is told they can't, and no applicants are fetched for them. */
export default function ApplicantPickerScreen({ flow }: { flow: NewLeaseFlow }) {
  return (
    <RequireWrite loading={<ApplicantsSkeleton label={NEW_LEASE_MESSAGES.loadingApplicants} />}>
      <ApplicantPickerList flow={flow} />
    </RequireWrite>
  );
}
