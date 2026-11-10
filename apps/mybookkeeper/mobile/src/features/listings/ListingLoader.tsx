import { useGetListingByIdQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
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
      action={isGone ? { label: LISTING_MESSAGES.back, onPress: () => router.back() } : { label: LISTING_MESSAGES.tryAgain, onPress: () => void refetch() }}
      body={isGone ? LISTING_MESSAGES.maybeDeleted : LISTING_MESSAGES.tryAgainOffer}
      heading={isGone ? LISTING_MESSAGES.cantFind : LISTING_MESSAGES.couldntLoadOne}
    />
  );
}
