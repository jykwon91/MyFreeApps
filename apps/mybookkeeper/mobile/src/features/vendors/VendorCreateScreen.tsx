import RequireWrite from "../workspace/RequireWrite";
import VendorDetailSkeleton from "./VendorDetailSkeleton";
import VendorFormScreen from "./VendorFormScreen";

export default function VendorCreateScreen() {
  return (
    <RequireWrite loading={<VendorDetailSkeleton />}>
      <VendorFormScreen original={null} />
    </RequireWrite>
  );
}
