import { useGetListingByIdQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState, goBackOr } from "@platform/mobile";
import { LISTING_MESSAGES } from "../../constants/listings";
import type { ListingGateProps } from "../../types/ListingGateProps";
import ListingDetailSkeleton from "./ListingDetailSkeleton";

/** Loads a listing for a screen that hangs off it: skeleton, a failed load with Try again, and a gone listing. */
export default function ListingLoader({ id, children }: Omit<ListingGateProps, "requireWrite">) {
  const { currentData: listing, error, isFetching, refetch } = useGetListingByIdQuery(id);

  if (listing) return children(listing);
  if (isFetching || !error) return <ListingDetailSkeleton />;
  const isGone = httpStatus(error) === 404;
  return (
    <EmptyState
      action={isGone ? { label: LISTING_MESSAGES.back, onPress: () => goBackOr("/listings") } : { label: LISTING_MESSAGES.tryAgain, onPress: () => refetch() }}
      body={isGone ? LISTING_MESSAGES.maybeDeleted : LISTING_MESSAGES.tryAgainOffer}
      heading={isGone ? LISTING_MESSAGES.cantFind : LISTING_MESSAGES.couldntLoadOne}
    />
  );
}
