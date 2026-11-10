import type { ListingGateProps } from "../../types/ListingGateProps";
import RequireWrite from "../workspace/RequireWrite";
import ListingDetailSkeleton from "./ListingDetailSkeleton";
import ListingLoader from "./ListingLoader";

/** Opens a listing for a screen that hangs off it. With requireWrite, a viewer is told they can't and the listing isn't fetched. */
export default function ListingGate({ requireWrite = false, ...loader }: ListingGateProps) {
  return (
    <RequireWrite loading={<ListingDetailSkeleton />} required={requireWrite}>
      <ListingLoader {...loader} />
    </RequireWrite>
  );
}
