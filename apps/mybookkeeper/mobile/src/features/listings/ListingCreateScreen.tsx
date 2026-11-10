import RequireWrite from "../workspace/RequireWrite";
import ListingDetailSkeleton from "./ListingDetailSkeleton";
import ListingFormScreen from "./ListingFormScreen";

export default function ListingCreateScreen() {
  return (
    <RequireWrite loading={<ListingDetailSkeleton />}>
      <ListingFormScreen original={null} />
    </RequireWrite>
  );
}
