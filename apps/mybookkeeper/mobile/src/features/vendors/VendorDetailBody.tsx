import { VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import type { VendorResponse } from "@mybookkeeper/api-client/types/vendor/vendor-response";
import { Banner, LoadingButton, SwitchRow, useOpenLink, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { type ReactElement, useRef } from "react";
import { Platform, type RefreshControlProps, ScrollView, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { DELETE_VENDOR_BODY, deleteVendorTitle, VENDOR_MESSAGES } from "../../constants/vendors";
import InquiryChip from "../inquiries/InquiryChip";
import InquiryContact from "../inquiries/InquiryContact";
import { askOnce } from "../../lib/askOnce";
import TransactionFact from "../transactions/TransactionFact";
import { directionsUrl, hourlyRateText, lastUsedText } from "./vendorDisplay";
import { useVendorActions } from "./useVendorActions";

interface VendorDetailBodyProps {
  vendor: VendorResponse;
  canWrite: boolean;
  /** A reload failed, so what's shown is what was last loaded. */
  hasStaleData: boolean;
  refreshControl: ReactElement<RefreshControlProps>;
  onDeleted: () => void;
}

export default function VendorDetailBody({ vendor, canWrite, hasStaleData, refreshControl, onDeleted }: VendorDetailBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const asking = useRef(false);
  const actions = useVendorActions(vendor, onDeleted);
  const isBusy = actions.isStarring || actions.isDeleting;
  const address = vendor.address?.trim();

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {hasStaleData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {actions.failure ? <Banner message={actions.failure} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {vendor.name}
        </Text>
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{VENDOR_CATEGORY_LABELS[vendor.category]}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{lastUsedText(vendor.last_used_at) ?? VENDOR_MESSAGES.neverUsed}</Text>
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
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <SwitchRow disabled={isBusy} label={VENDOR_MESSAGES.preferred} onValueChange={(next) => void actions.setPreferred(next)} value={vendor.preferred} />
          <LoadingButton disabled={isBusy} onPress={() => router.push(`/vendors/${vendor.id}/edit`)}>
            {VENDOR_MESSAGES.edit}
          </LoadingButton>
          <LoadingButton
            disabled={isBusy}
            isLoading={actions.isDeleting}
            loadingText={VENDOR_MESSAGES.deleting}
            onPress={() =>
              askOnce(asking, deleteVendorTitle(vendor.name), DELETE_VENDOR_BODY, {
                text: VENDOR_MESSAGES.delete,
                style: "destructive",
                onPress: () => void actions.remove(),
              })
            }
            variant="destructive"
          >
            {VENDOR_MESSAGES.delete}
          </LoadingButton>
        </View>
      ) : null}
    </ScrollView>
  );
}
