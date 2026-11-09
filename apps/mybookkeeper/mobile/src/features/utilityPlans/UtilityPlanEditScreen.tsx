import { useGetUtilityPlanByIdQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { UTILITY_PLAN_FORM_MESSAGES as FORM_MESSAGES } from "../../constants/utilityPlanForm";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import { useCanWrite } from "../workspace/useCanWrite";
import UtilityPlanDetailSkeleton from "./UtilityPlanDetailSkeleton";
import UtilityPlanForm from "./UtilityPlanForm";

export default function UtilityPlanEditScreen({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const { currentData: plan, error, isFetching, refetch } = useGetUtilityPlanByIdQuery(id);

  if (!canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  // Keyed so a reload can't replace what's being typed.
  if (plan) return <UtilityPlanForm key={plan.id} original={plan} />;
  if (!error || isFetching) return <UtilityPlanDetailSkeleton />;
  const isGone = httpStatus(error) === 404;
  return (
    <EmptyState
      action={isGone ? { label: MESSAGES.back, onPress: () => router.back() } : { label: MESSAGES.tryAgain, onPress: () => void refetch() }}
      body={isGone ? MESSAGES.maybeDeleted : MESSAGES.tryAgainOffer}
      heading={isGone ? MESSAGES.cantFind : MESSAGES.couldntLoadOne}
    />
  );
}
