import RequireWrite from "../workspace/RequireWrite";
import PropertyDetailSkeleton from "./PropertyDetailSkeleton";
import PropertyFormScreen from "./PropertyFormScreen";

export default function PropertyCreateScreen() {
  return (
    <RequireWrite loading={<PropertyDetailSkeleton />}>
      <PropertyFormScreen original={null} />
    </RequireWrite>
  );
}
