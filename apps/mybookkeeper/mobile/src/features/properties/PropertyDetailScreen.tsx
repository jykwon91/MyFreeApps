import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { EmptyState, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { PROPERTY_MESSAGES } from "../../constants/properties";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";
import { useCanWrite } from "../workspace/useCanWrite";
import PropertyDetailBody from "./PropertyDetailBody";
import PropertyDetailSkeleton from "./PropertyDetailSkeleton";

/** One property. The API has no single-property read, so this finds it in the list. */
export default function PropertyDetailScreen({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const { isLeaving, leave } = useLeaveWhenSaved("/properties");
  const property = currentData?.find((candidate) => candidate.id === id);

  if (isLeaving || (!currentData && (isFetching || !error))) return <PropertyDetailSkeleton />;
  if (property) {
    return <PropertyDetailBody canWrite={canWrite} hasStaleData={Boolean(error)} onDeleted={leave} property={property} refreshControl={refreshControl} />;
  }
  return currentData ? (
    <EmptyState
      action={{ label: PROPERTY_MESSAGES.back, onPress: () => router.back() }}
      body={PROPERTY_MESSAGES.maybeDeleted}
      heading={PROPERTY_MESSAGES.cantFind}
    />
  ) : (
    <EmptyState
      action={{ label: PROPERTY_MESSAGES.tryAgain, onPress: refresh }}
      body={PROPERTY_MESSAGES.tryAgainOffer}
      heading={PROPERTY_MESSAGES.couldntLoadOne}
    />
  );
}
