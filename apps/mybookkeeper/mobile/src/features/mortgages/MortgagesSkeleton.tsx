import { LoadingRegion } from "@platform/mobile";
import { MORTGAGE_MESSAGES, MORTGAGE_SKELETON_ROWS } from "../../constants/mortgages";
import MortgageSkeletonRow from "./MortgageSkeletonRow";

export default function MortgagesSkeleton() {
  return (
    <LoadingRegion label={MORTGAGE_MESSAGES.loadingList} testID="mortgages-skeleton">
      {MORTGAGE_SKELETON_ROWS.map((row) => (
        <MortgageSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
