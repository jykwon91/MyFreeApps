import RequireWrite from "../workspace/RequireWrite";
import PropertyDetailSkeleton from "./PropertyDetailSkeleton";
import PropertyEditLoader from "./PropertyEditLoader";

/** Edits a property. A viewer is told they can't, and the list isn't fetched for them. */
export default function PropertyEditScreen({ id }: { id: string }) {
  return (
    <RequireWrite loading={<PropertyDetailSkeleton />}>
      <PropertyEditLoader id={id} />
    </RequireWrite>
  );
}
