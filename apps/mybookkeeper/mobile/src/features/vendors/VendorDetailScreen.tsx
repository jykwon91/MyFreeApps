import { VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import { useGetVendorByIdQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Platform, ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import InquiryChip from "../inquiries/InquiryChip";
import InquiryContact from "../inquiries/InquiryContact";
import { useOpenLink } from "../inquiries/useOpenLink";
import TransactionFact from "../transactions/TransactionFact";
import { httpStatus } from "../transactions/transactionMessages";
import { directionsUrl, hourlyRateText } from "./vendorDisplay";
import VendorDetailSkeleton from "./VendorDetailSkeleton";

interface VendorDetailScreenProps {
  id: string;
}

export default function VendorDetailScreen({ id }: VendorDetailScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData: vendor, error, isFetching, refetch } = useGetVendorByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (!vendor && (isFetching || !error)) return <VendorDetailSkeleton />;
  if (!vendor) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: VENDOR_MESSAGES.back, onPress: () => router.back() } : { label: VENDOR_MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? VENDOR_MESSAGES.maybeDeleted : VENDOR_MESSAGES.tryAgainOffer}
        heading={isGone ? VENDOR_MESSAGES.cantFind : VENDOR_MESSAGES.couldntLoadOne}
      />
    );
  }

  const address = vendor.address?.trim();

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {vendor.name}
        </Text>
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{VENDOR_CATEGORY_LABELS[vendor.category]}</Text>
        {vendor.preferred ? (
          <View style={{ flexDirection: "row" }}>
            <InquiryChip label={VENDOR_MESSAGES.preferred} />
          </View>
        ) : null}
      </View>
      <InquiryContact email={vendor.email} name={vendor.name} phone={vendor.phone} />
      {address ? (
        <View style={{ gap: spacing.sm }}>
          <TransactionFact label={VENDOR_MESSAGES.address} value={address} />
          <LoadingButton
            accessibilityLabel={`${VENDOR_MESSAGES.directions} to ${vendor.name}`}
            onPress={() => void openLink(directionsUrl(address, Platform.OS))}
            variant="secondary"
          >
            {VENDOR_MESSAGES.directions}
          </LoadingButton>
        </View>
      ) : null}
      {vendor.hourly_rate ? <TransactionFact label={VENDOR_MESSAGES.hourlyRate} value={hourlyRateText(vendor.hourly_rate)} /> : null}
      {vendor.flat_rate_notes ? <TransactionFact label={VENDOR_MESSAGES.flatRates} value={vendor.flat_rate_notes} /> : null}
      {vendor.notes ? <TransactionFact label={VENDOR_MESSAGES.notes} value={vendor.notes} /> : null}
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{VENDOR_MESSAGES.manageOnWebsite}</Text>
        <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/vendors/${vendor.id}`)} variant="ghost">
          {VENDOR_MESSAGES.openWebsite}
        </LoadingButton>
      </View>
    </ScrollView>
  );
}
