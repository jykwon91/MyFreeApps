import { useGetInsurancePolicyByIdQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import { useCanWrite } from "../workspace/useCanWrite";
import PolicyDetailSkeleton from "./PolicyDetailSkeleton";
import PolicyForm from "./PolicyForm";

export default function EditPolicyScreen({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const { currentData: policy, error, isFetching, refetch } = useGetInsurancePolicyByIdQuery(id);
  if (!canWrite) return <EmptyState action={{ label: INSURANCE_MESSAGES.back, onPress: () => router.back() }} body={INSURANCE_MESSAGES.notAllowedBody} heading={INSURANCE_MESSAGES.notAllowed} />;
  if (!policy && (isFetching || !error)) return <PolicyDetailSkeleton />;
  if (!policy) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: INSURANCE_MESSAGES.back, onPress: () => router.back() } : { label: INSURANCE_MESSAGES.tryAgain, onPress: () => void refetch() }}
        body={isGone ? INSURANCE_MESSAGES.maybeDeleted : INSURANCE_MESSAGES.tryAgainOffer}
        heading={isGone ? INSURANCE_MESSAGES.cantFind : INSURANCE_MESSAGES.couldntLoadOne}
      />
    );
  }
  return <PolicyForm policy={policy} />;
}
