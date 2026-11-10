import { UTILITY_PLAN_FORM_MESSAGES as MESSAGES } from "../../constants/utilityPlanForm";
import RequireWrite from "../workspace/RequireWrite";
import UtilityPlanDetailSkeleton from "./UtilityPlanDetailSkeleton";
import UtilityPlanForm from "./UtilityPlanForm";

export default function UtilityPlanFormScreen() {
  return (
    <RequireWrite loading={<UtilityPlanDetailSkeleton />} body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading}>
      <UtilityPlanForm original={null} />
    </RequireWrite>
  );
}
