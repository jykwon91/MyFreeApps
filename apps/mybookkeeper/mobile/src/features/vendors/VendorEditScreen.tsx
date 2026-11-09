import { useGetVendorByIdQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { FORM_MESSAGES } from "../../constants/forms";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import { useCanWrite } from "../workspace/useCanWrite";
import VendorDetailSkeleton from "./VendorDetailSkeleton";
import VendorFormScreen from "./VendorFormScreen";

export default function VendorEditScreen({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const { currentData: vendor, error, isFetching, refetch } = useGetVendorByIdQuery(id);

  if (!canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  if (vendor) return <VendorFormScreen key={vendor.id} original={vendor} />;
  if (isFetching || !error) return <VendorDetailSkeleton />;
  const isGone = httpStatus(error) === 404;
  return (
    <EmptyState
      action={isGone ? { label: VENDOR_MESSAGES.back, onPress: () => router.back() } : { label: VENDOR_MESSAGES.tryAgain, onPress: () => void refetch() }}
      body={isGone ? VENDOR_MESSAGES.maybeDeleted : VENDOR_MESSAGES.tryAgainOffer}
      heading={isGone ? VENDOR_MESSAGES.cantFind : VENDOR_MESSAGES.couldntLoadOne}
    />
  );
}
