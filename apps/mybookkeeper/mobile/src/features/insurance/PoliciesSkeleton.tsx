import { LoadingRegion } from "@platform/mobile";
import { INSURANCE_MESSAGES, POLICY_SKELETON_ROWS } from "../../constants/insurance";
import PolicySkeletonRow from "./PolicySkeletonRow";

export default function PoliciesSkeleton() {
  return (
    <LoadingRegion label={INSURANCE_MESSAGES.loadingList} testID="policies-skeleton">
      {POLICY_SKELETON_ROWS.map((row) => (
        <PolicySkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
