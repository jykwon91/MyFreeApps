import { useGetListingByIdQuery } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import type { ReactElement } from "react";
import { FORM_MESSAGES } from "../../constants/forms";
import { LISTING_MESSAGES } from "../../constants/listings";
import { useCanWrite } from "../workspace/useCanWrite";
import ListingDetailSkeleton from "./ListingDetailSkeleton";

interface ListingGateProps {
  id: string;
  /** For screens that change things: a viewer sees why they can't, not a form that will fail. */
  requireWrite?: boolean;
  children: (listing: ListingResponse) => ReactElement;
}

/** Loads a listing for a screen that hangs off it: skeleton, a failed load with Try again, a gone listing, and view-only. */
export default function ListingGate({ id, requireWrite = false, children }: ListingGateProps) {
  const canWrite = useCanWrite();
  const { currentData: listing, error, isFetching, refetch } = useGetListingByIdQuery(id);

  if (requireWrite && !canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  if (listing) return children(listing);
  if (isFetching || !error) return <ListingDetailSkeleton />;
  const isGone = httpStatus(error) === 404;
  return (
    <EmptyState
      action={isGone ? { label: LISTING_MESSAGES.back, onPress: () => router.back() } : { label: LISTING_MESSAGES.tryAgain, onPress: () => void refetch() }}
      body={isGone ? LISTING_MESSAGES.maybeDeleted : LISTING_MESSAGES.tryAgainOffer}
      heading={isGone ? LISTING_MESSAGES.cantFind : LISTING_MESSAGES.couldntLoadOne}
    />
  );
}
