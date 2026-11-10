import { useGetListingByIdQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { Banner, EmptyState, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView } from "react-native";
import { LISTING_LINK_MESSAGES as MESSAGES } from "../../constants/listingLinks";
import { useCanWrite } from "../workspace/useCanWrite";
import ListingGate from "./ListingGate";
import ListingLinkRow from "./ListingLinkRow";

function LinksBody({ id }: { id: string }) {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const { currentData: listing, error, refetch } = useGetListingByIdQuery(id);
  const { refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const links = listing?.external_ids ?? [];
  const add = () => router.push(`/listings/${id}/links/new`);

  if (links.length === 0) {
    return (
      <EmptyState
        action={canWrite ? { label: MESSAGES.add, onPress: add } : undefined}
        body={canWrite ? MESSAGES.noneBody : MESSAGES.noneViewOnlyBody}
        heading={MESSAGES.noneHeading}
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {canWrite ? <LoadingButton onPress={add}>{MESSAGES.add}</LoadingButton> : null}
      {links.map((link) => (
        <ListingLinkRow canWrite={canWrite} key={link.id} link={link} />
      ))}
    </ScrollView>
  );
}

export default function ListingLinksScreen({ id }: { id: string }) {
  return <ListingGate id={id}>{() => <LinksBody id={id} />}</ListingGate>;
}
