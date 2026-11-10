import RequireWrite from "../workspace/RequireWrite";
import VendorDetailSkeleton from "./VendorDetailSkeleton";
import VendorEditLoader from "./VendorEditLoader";

/** Edits a vendor. A viewer is told they can't, and the vendor isn't fetched for them. */
export default function VendorEditScreen({ id }: { id: string }) {
  return (
    <RequireWrite loading={<VendorDetailSkeleton />}>
      <VendorEditLoader id={id} />
    </RequireWrite>
  );
}
