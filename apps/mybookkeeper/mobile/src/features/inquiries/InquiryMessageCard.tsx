import type { InquiryMessage } from "@mybookkeeper/api-client/types/inquiry/inquiry-message";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { CLAMPED_MESSAGE_LINES, LONG_MESSAGE_CHARACTERS } from "../../constants/inquiries";
import { messageBody, messageSpeaker, messageWhen, spokenMessage } from "./inquiryDisplay";

export default function InquiryMessageCard({ message, name }: { message: InquiryMessage; name: string | null }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const body = messageBody(message);
  const isLong = body.length > LONG_MESSAGE_CHARACTERS || body.split("\n").length > CLAMPED_MESSAGE_LINES;
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View
      style={{
        gap: spacing.xs,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: message.direction === "outbound" ? colors.muted : colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View accessibilityLabel={spokenMessage(message, name)} accessible style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${messageSpeaker(message, name)} · ${messageWhen(message)}`}</Text>
        <Text numberOfLines={isLong && !isExpanded ? CLAMPED_MESSAGE_LINES : undefined} selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {body}
        </Text>
      </View>
      {isLong ? (
        <LoadingButton onPress={() => setIsExpanded(!isExpanded)} variant="ghost">
          {isExpanded ? "Show less" : "Show more"}
        </LoadingButton>
      ) : null}
    </View>
  );
}
