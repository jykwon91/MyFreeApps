import { useGetListingByIdQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState, useLeaveWhenSaved, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { LISTING_MESSAGES } from "../../constants/listings";
import { useCanWrite } from "../workspace/useCanWrite";
import ListingDetailBody from "./ListingDetailBody";
import ListingDetailSkeleton from "./ListingDetailSkeleton";

interface ListingDetailScreenProps {
  id: string;
}

export default function ListingDetailScreen({ id }: ListingDetailScreenProps) {
  const canWrite = useCanWrite();
  const { currentData: listing, error, isFetching, refetch } = useGetListingByIdQuery(id);
  const { data: properties = [] } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const { isLeaving, leave } = useLeaveWhenSaved("/listings");

  if (isLeaving || (!listing && (isFetching || !error))) return <ListingDetailSkeleton />;
  if (!listing) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: LISTING_MESSAGES.back, onPress: () => router.back() } : { label: LISTING_MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? LISTING_MESSAGES.maybeDeleted : LISTING_MESSAGES.tryAgainOffer}
        heading={isGone ? LISTING_MESSAGES.cantFind : LISTING_MESSAGES.couldntLoadOne}
      />
    );
  }
  return (
    <ListingDetailBody
      canWrite={canWrite}
      hasStaleData={Boolean(error)}
      listing={listing}
      onDeleted={leave}
      propertyName={properties.find((property) => property.id === listing.property_id)?.name}
      refreshControl={refreshControl}
    />
  );
}
