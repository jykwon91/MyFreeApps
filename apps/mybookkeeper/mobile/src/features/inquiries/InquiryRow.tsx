import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import { Chip, ClampedText, LARGE_TEXT_PREVIEW_LINES, ListRowTitle, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
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
      <ListRowTitle
        aside={<Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{receivedAgo(inquiry.received_at)}</Text>}
        title={inquirerName(inquiry.inquirer_name)}
      />
      <ClampedText numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {rowDetails(inquiry)}
      </ClampedText>
      <ClampedText numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {listingTitle ?? INQUIRY_ROW_NO_LISTING}
      </ClampedText>
      {inquiry.last_message_preview ? (
        <ClampedText largeTextNumberOfLines={LARGE_TEXT_PREVIEW_LINES} numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
          {inquiry.last_message_preview}
        </ClampedText>
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
