import { LoadingRegion } from "@platform/mobile";
import { VENDOR_MESSAGES, VENDOR_SKELETON_ROWS } from "../../constants/vendors";
import VendorSkeletonRow from "./VendorSkeletonRow";

export default function VendorsSkeleton() {
  return (
    <LoadingRegion label={VENDOR_MESSAGES.loadingList} testID="vendors-skeleton">
      {VENDOR_SKELETON_ROWS.map((row) => (
        <VendorSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
