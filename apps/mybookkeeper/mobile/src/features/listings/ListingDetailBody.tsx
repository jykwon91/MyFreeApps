import { LISTING_STATUS_LABELS, LISTING_STATUSES } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import { Banner, LoadingButton, OptionSheet, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { type ReactElement, useMemo, useRef, useState } from "react";
import { type RefreshControlProps, ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { deleteListingTitle, LISTING_MESSAGES } from "../../constants/listings";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { askOnce } from "../../lib/askOnce";
import { plainFromMarkdown } from "../../lib/plainFromMarkdown";
import InquiryChip from "../inquiries/InquiryChip";
import { useOpenLink } from "../inquiries/useOpenLink";
import TransactionFact from "../transactions/TransactionFact";
import ListingFacts from "./ListingFacts";
import ListingShareLink from "./ListingShareLink";
import ListingSummaryRow from "./ListingSummaryRow";
import ListingSummaryRows from "./ListingSummaryRows";
import { useListingActions } from "./useListingActions";

const STATUS_OPTIONS = LISTING_STATUSES.map((value) => ({ value, label: LISTING_STATUS_LABELS[value] }));

interface ListingDetailBodyProps {
  listing: ListingResponse;
  propertyName: string | undefined;
  canWrite: boolean;
  /** A reload failed, so what's shown is what was last loaded. */
  hasStaleData: boolean;
  refreshControl: ReactElement<RefreshControlProps>;
  onDeleted: () => void;
}

export default function ListingDetailBody({ listing, propertyName, canWrite, hasStaleData, refreshControl, onDeleted }: ListingDetailBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const asking = useRef(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const actions = useListingActions(listing, onDeleted);
  const isBusy = actions.isChangingStatus || actions.isDeleting;
  const markdown = listing.description;
  const description = useMemo(() => (markdown ? plainFromMarkdown(markdown) : null), [markdown]);

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {hasStaleData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {actions.failure ? <Banner message={actions.failure} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {listing.title}
        </Text>
        <View accessible accessibilityLabel={`Status: ${LISTING_STATUS_LABELS[listing.status]}`}>
          <InquiryChip label={LISTING_STATUS_LABELS[listing.status]} />
        </View>
      </View>
      {propertyName ? <ListingSummaryRow label={LISTING_MESSAGES.property} onPress={() => router.push(`/properties/${listing.property_id}`)} value={propertyName} /> : null}
      {listing.slug ? <ListingShareLink slug={listing.slug} /> : null}
      {listing.pets_on_premises ? (
        <TransactionFact label={LISTING_MESSAGES.petsLabel} value={listing.large_dog_disclosure?.trim() || LISTING_MESSAGES.petsDefault} />
      ) : null}
      <ListingFacts listing={listing} />
      {description ? <TransactionFact label={LISTING_MESSAGES.description} value={description} /> : null}
      <ListingSummaryRows listing={listing} />
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton disabled={isBusy} onPress={() => router.push(`/listings/${listing.id}/edit`)}>
            {LISTING_MESSAGES.edit}
          </LoadingButton>
          <LoadingButton disabled={isBusy} isLoading={actions.isChangingStatus} onPress={() => setIsStatusOpen(true)} variant="secondary">
            {LISTING_MESSAGES.changeStatus}
          </LoadingButton>
          <LoadingButton
            disabled={isBusy}
            isLoading={actions.isDeleting}
            loadingText={LISTING_MESSAGES.deleting}
            onPress={() =>
              askOnce(asking, deleteListingTitle(listing.title), LISTING_MESSAGES.deleteBody, {
                text: LISTING_MESSAGES.delete,
                style: "destructive",
                onPress: () => void actions.remove(),
              })
            }
            variant="destructive"
          >
            {LISTING_MESSAGES.delete}
          </LoadingButton>
        </View>
      ) : null}
      <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/listings/${listing.id}`)} variant="ghost">
        {LISTING_MESSAGES.openWebsite}
      </LoadingButton>
      <OptionSheet<ListingStatus>
        isOpen={isStatusOpen}
        onClose={() => setIsStatusOpen(false)}
        onSelect={(status) => {
          setIsStatusOpen(false);
          void actions.setStatus(status);
        }}
        options={STATUS_OPTIONS}
        title={LISTING_MESSAGES.chooseNewStatus}
        value={listing.status}
      />
    </ScrollView>
  );
}
