import { router } from "expo-router";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import RequireWrite from "../workspace/RequireWrite";
import EditPolicyLoader from "./EditPolicyLoader";
import PolicyDetailSkeleton from "./PolicyDetailSkeleton";

/** Edits an insurance policy. A viewer is told they can't, and the policy isn't fetched for them. */
export default function EditPolicyScreen({ id }: { id: string }) {
  return (
    <RequireWrite action={{ label: INSURANCE_MESSAGES.back, onPress: () => router.back() }} body={INSURANCE_MESSAGES.notAllowedBody} heading={INSURANCE_MESSAGES.notAllowed} loading={<PolicyDetailSkeleton />}>
      <EditPolicyLoader id={id} />
    </RequireWrite>
  );
}
