import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { INQUIRY_ROW_NO_LISTING } from "../../constants/inquiries";
import { inquirerName, qualityLabel, receivedAgo, rowAccessibilityLabel, rowDetails, shortSource, spamLabel, stageLabel } from "./inquiryDisplay";

export default function InquiryRow({
  inquiry,
  showStage,
  showSpam,
  listingTitle,
  onPress,
}: {
  inquiry: InquirySummary;
  showStage: boolean;
  showSpam: boolean;
  listingTitle: string | null;
  onPress: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const quality = qualityLabel(inquiry);
  const spam = showSpam ? spamLabel(inquiry.spam_status) : null;

  return (
    <Pressable
      accessibilityLabel={rowAccessibilityLabel(inquiry)}
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
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {inquirerName(inquiry.inquirer_name)}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{receivedAgo(inquiry.received_at)}</Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {rowDetails(inquiry)}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {listingTitle ?? INQUIRY_ROW_NO_LISTING}
      </Text>
      {inquiry.last_message_preview ? (
        <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
          {inquiry.last_message_preview}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {showStage ? <Chip label={stageLabel(inquiry.stage)} /> : null}
        <Chip label={shortSource(inquiry)} />
        {quality ? <Chip label={quality} /> : null}
        {spam ? <Chip label={spam} /> : null}
      </View>
    </Pressable>
  );
}
