import { UTILITY_PLAN_FORM_MESSAGES as MESSAGES } from "../../constants/utilityPlanForm";
import RequireWrite from "../workspace/RequireWrite";
import UtilityPlanDetailSkeleton from "./UtilityPlanDetailSkeleton";
import UtilityPlanEditLoader from "./UtilityPlanEditLoader";

/** Edits a utility plan. A viewer is told they can't, and the plan isn't fetched for them. */
export default function UtilityPlanEditScreen({ id }: { id: string }) {
  return (
    <RequireWrite body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading} loading={<UtilityPlanDetailSkeleton />}>
      <UtilityPlanEditLoader id={id} />
    </RequireWrite>
  );
}
