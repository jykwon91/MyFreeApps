import { LISTING_STATUS_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import InquiryChip from "../inquiries/InquiryChip";
import { listingRowLabel, monthlyRateText } from "./listingDisplay";

interface ListingRowProps {
  listing: ListingSummary;
  propertyName: string | null;
  onPress: () => void;
}

export default function ListingRow({ listing, propertyName, onPress }: ListingRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={listingRowLabel(listing, propertyName)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {listing.title}
      </Text>
      {propertyName ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {propertyName}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <InquiryChip label={LISTING_STATUS_LABELS[listing.status]} />
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{monthlyRateText(listing.monthly_rate)}</Text>
      </View>
    </Pressable>
  );
}
