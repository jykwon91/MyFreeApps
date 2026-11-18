import { useGetVendorByIdQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState, goBackOr } from "@platform/mobile";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import VendorDetailSkeleton from "./VendorDetailSkeleton";
import VendorFormScreen from "./VendorFormScreen";

export default function VendorEditLoader({ id }: { id: string }) {
  const { currentData: vendor, error, isFetching, refetch } = useGetVendorByIdQuery(id);

  if (vendor) return <VendorFormScreen key={vendor.id} original={vendor} />;
  if (isFetching || !error) return <VendorDetailSkeleton />;
  const isGone = httpStatus(error) === 404;
  return (
    <EmptyState
      action={isGone ? { label: VENDOR_MESSAGES.back, onPress: () => goBackOr("/vendors") } : { label: VENDOR_MESSAGES.tryAgain, onPress: () => refetch() }}
      body={isGone ? VENDOR_MESSAGES.maybeDeleted : VENDOR_MESSAGES.tryAgainOffer}
      heading={isGone ? VENDOR_MESSAGES.cantFind : VENDOR_MESSAGES.couldntLoadOne}
    />
  );
}
