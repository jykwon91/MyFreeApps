import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CONVERSATION_MESSAGES, PARTIAL_REPLY_MARK } from "../../constants/conversation";
import type { TutorBubbleProps } from "../../types/TutorBubbleProps";

/** One tutor reply, with its English translation folded away. Replay buttons come with spoken replies. */
export default function TutorBubble({ text, translation, partial }: TutorBubbleProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [showTranslation, setShowTranslation] = useState(false);
  return (
    <View style={{ alignItems: "flex-start", gap: spacing.xs }}>
      <Text
        accessibilityLabel={`${CONVERSATION_MESSAGES.tutorSaid}: ${text}`}
        style={{
          maxWidth: "85%",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radius.md * 2,
          borderBottomLeftRadius: radius.sm,
          overflow: "hidden",
          backgroundColor: colors.muted,
          color: colors.foreground,
          fontSize: fontSize.sm,
        }}
      >
        {text}
        {partial ? <Text style={{ color: colors.mutedForeground }}>{PARTIAL_REPLY_MARK}</Text> : null}
      </Text>
      {partial ? (
        <Text style={{ paddingHorizontal: spacing.xs, color: colors.mutedForeground, fontSize: fontSize.xs }}>{PRACTICE_COPY.replyCutOff}</Text>
      ) : null}
      {translation ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showTranslation }}
          onPress={() => setShowTranslation((shown) => !shown)}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.xs }}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs, textDecorationLine: "underline" }}>
            {showTranslation ? PRACTICE_COPY.hideTranslation : PRACTICE_COPY.showTranslation}
          </Text>
        </Pressable>
      ) : null}
      {translation && showTranslation ? (
        <Text style={{ paddingHorizontal: spacing.xs, color: colors.mutedForeground, fontSize: fontSize.sm }}>{translation}</Text>
      ) : null}
    </View>
  );
}
