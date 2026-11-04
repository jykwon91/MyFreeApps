import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import InquiryChip from "./InquiryChip";
import { inquirerName, qualityLabel, receivedAgo, rowAccessibilityLabel, rowDetails, shortSource, spamLabel, stageLabel } from "./inquiryDisplay";

export default function InquiryRow({
  inquiry,
  showStage,
  showSpam,
  onPress,
}: {
  inquiry: InquirySummary;
  showStage: boolean;
  showSpam: boolean;
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
      {inquiry.last_message_preview ? (
        <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
          {inquiry.last_message_preview}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {showStage ? <InquiryChip label={stageLabel(inquiry.stage)} /> : null}
        <InquiryChip label={shortSource(inquiry)} />
        {quality ? <InquiryChip label={quality} /> : null}
        {spam ? <InquiryChip label={spam} /> : null}
      </View>
    </Pressable>
  );
}
