import { useGetInsurancePolicyByIdQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import PolicyDetailSkeleton from "./PolicyDetailSkeleton";
import PolicyForm from "./PolicyForm";

export default function EditPolicyLoader({ id }: { id: string }) {
  const { currentData: policy, error, isFetching, refetch } = useGetInsurancePolicyByIdQuery(id);
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
