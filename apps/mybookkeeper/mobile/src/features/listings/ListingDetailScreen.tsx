import { LISTING_STATUS_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import { useGetListingByIdQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { LISTING_MESSAGES } from "../../constants/listings";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { plainFromMarkdown } from "../../lib/plainFromMarkdown";
import InquiryChip from "../inquiries/InquiryChip";
import { useOpenLink } from "../inquiries/useOpenLink";
import TransactionFact from "../transactions/TransactionFact";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import ListingDetailSkeleton from "./ListingDetailSkeleton";
import ListingFacts from "./ListingFacts";
import ListingShareLink from "./ListingShareLink";

interface ListingDetailScreenProps {
  id: string;
}

export default function ListingDetailScreen({ id }: ListingDetailScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData: listing, error, isFetching, refetch } = useGetListingByIdQuery(id);
  const { data: properties = [] } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  const markdown = listing?.description;
  const description = useMemo(() => (markdown ? plainFromMarkdown(markdown) : null), [markdown]);

  if (!listing && (isFetching || !error)) return <ListingDetailSkeleton />;
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

  const propertyName = properties.find((property) => property.id === listing.property_id)?.name;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {listing.title}
        </Text>
        {propertyName ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{propertyName}</Text> : null}
        <View accessible accessibilityLabel={`Status: ${LISTING_STATUS_LABELS[listing.status]}`}>
          <InquiryChip label={LISTING_STATUS_LABELS[listing.status]} />
        </View>
      </View>
      {listing.slug ? <ListingShareLink slug={listing.slug} /> : null}
      {listing.pets_on_premises ? (
        <TransactionFact label={LISTING_MESSAGES.petsLabel} value={listing.large_dog_disclosure?.trim() || LISTING_MESSAGES.petsDefault} />
      ) : null}
      <ListingFacts listing={listing} />
      {description ? <TransactionFact label={LISTING_MESSAGES.description} value={description} /> : null}
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{LISTING_MESSAGES.onTheWebsite}</Text>
        <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/listings/${listing.id}`)} variant="ghost">
          {LISTING_MESSAGES.openWebsite}
        </LoadingButton>
      </View>
    </ScrollView>
  );
}
