import { router } from "expo-router";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import RequireWrite from "../workspace/RequireWrite";
import PolicyDetailSkeleton from "./PolicyDetailSkeleton";
import PolicyForm from "./PolicyForm";

export default function NewPolicyScreen() {
  return (
    <RequireWrite loading={<PolicyDetailSkeleton />} action={{ label: INSURANCE_MESSAGES.back, onPress: () => router.back() }} body={INSURANCE_MESSAGES.notAllowedBody} heading={INSURANCE_MESSAGES.notAllowed}>
      <PolicyForm />
    </RequireWrite>
  );
}
