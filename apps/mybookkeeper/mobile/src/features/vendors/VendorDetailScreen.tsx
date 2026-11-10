import { useGetVendorByIdQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState, useLeaveWhenSaved, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import { useCanWrite } from "../workspace/useCanWrite";
import VendorDetailBody from "./VendorDetailBody";
import VendorDetailSkeleton from "./VendorDetailSkeleton";

export default function VendorDetailScreen({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const { currentData: vendor, error, isFetching, refetch } = useGetVendorByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const { isLeaving, leave } = useLeaveWhenSaved("/vendors");

  if (isLeaving || (!vendor && (isFetching || !error))) return <VendorDetailSkeleton />;
  if (!vendor) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: VENDOR_MESSAGES.back, onPress: () => router.back() } : { label: VENDOR_MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? VENDOR_MESSAGES.maybeDeleted : VENDOR_MESSAGES.tryAgainOffer}
        heading={isGone ? VENDOR_MESSAGES.cantFind : VENDOR_MESSAGES.couldntLoadOne}
      />
    );
  }
  return <VendorDetailBody canWrite={canWrite} hasStaleData={Boolean(error)} onDeleted={leave} refreshControl={refreshControl} vendor={vendor} />;
}
