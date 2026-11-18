import { LoadingRegion } from "@platform/mobile";
import { LISTING_MESSAGES, LISTING_SKELETON_ROWS } from "../../constants/listings";
import ListingSkeletonRow from "./ListingSkeletonRow";

export default function ListingsSkeleton() {
  return (
    <LoadingRegion label={LISTING_MESSAGES.loadingList} testID="listings-skeleton">
      {LISTING_SKELETON_ROWS.map((row) => (
        <ListingSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
