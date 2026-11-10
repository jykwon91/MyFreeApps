import { VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import { LoadingButton, MIN_TOUCH_TARGET, useOpenLink, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import InquiryChip from "../inquiries/InquiryChip";
import { callLink, vendorRowLabel } from "./vendorDisplay";

interface VendorRowProps {
  vendor: VendorSummary;
  onPress: () => void;
}

export default function VendorRow({ vendor, onPress }: VendorRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const open = useOpenLink();
  const call = callLink(vendor);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingRight: spacing.lg }}>
      <Pressable
        accessibilityLabel={vendorRowLabel(vendor)}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: MIN_TOUCH_TARGET,
          gap: spacing.xs,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: pressed ? colors.muted : colors.background,
        })}
      >
        <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {vendor.name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {VENDOR_CATEGORY_LABELS[vendor.category]}
        </Text>
        {vendor.preferred ? (
          <View style={{ flexDirection: "row" }}>
            <InquiryChip label={VENDOR_MESSAGES.preferred} />
          </View>
        ) : null}
      </Pressable>
      {call ? (
        <LoadingButton accessibilityLabel={call.spoken} onPress={() => void open(call.url)} variant="secondary">
          {VENDOR_MESSAGES.call}
        </LoadingButton>
      ) : null}
    </View>
  );
}
