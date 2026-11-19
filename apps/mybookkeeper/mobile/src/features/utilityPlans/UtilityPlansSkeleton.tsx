import { LoadingRegion } from "@platform/mobile";
import { UTILITY_PLAN_MESSAGES, UTILITY_PLAN_SKELETON_ROWS } from "../../constants/utilityPlans";
import UtilityPlanSkeletonRow from "./UtilityPlanSkeletonRow";

export default function UtilityPlansSkeleton() {
  return (
    <LoadingRegion label={UTILITY_PLAN_MESSAGES.loadingList} testID="utility-plans-skeleton">
      {UTILITY_PLAN_SKELETON_ROWS.map((row) => (
        <UtilityPlanSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
