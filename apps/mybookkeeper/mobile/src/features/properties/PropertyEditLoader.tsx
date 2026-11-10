import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { PROPERTY_MESSAGES } from "../../constants/properties";
import PropertyDetailSkeleton from "./PropertyDetailSkeleton";
import PropertyFormScreen from "./PropertyFormScreen";

/** The API has no single-property read, so this finds it in the list. */
export default function PropertyEditLoader({ id }: { id: string }) {
  const { currentData, error, isFetching, refetch } = useGetPropertiesQuery();
  // A failed save can drop the property from the list; the form stays so what was typed isn't lost.
  const [lastSeen, setLastSeen] = useState<Property | null>(null);
  const found = currentData?.find((candidate) => candidate.id === id);
  if (found && found !== lastSeen) setLastSeen(found);
  const property = found ?? lastSeen ?? undefined;

  if (property) return <PropertyFormScreen key={property.id} original={property} />;
  if (!currentData && (isFetching || !error)) return <PropertyDetailSkeleton />;
  if (!currentData) {
    return (
      <EmptyState
        action={{ label: PROPERTY_MESSAGES.tryAgain, onPress: () => void refetch() }}
        body={PROPERTY_MESSAGES.tryAgainOffer}
        heading={PROPERTY_MESSAGES.couldntLoadOne}
      />
    );
  }
  return (
    <EmptyState
      action={{ label: PROPERTY_MESSAGES.back, onPress: () => router.back() }}
      body={PROPERTY_MESSAGES.maybeDeleted}
      heading={PROPERTY_MESSAGES.cantFind}
    />
  );
}
