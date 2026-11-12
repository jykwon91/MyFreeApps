import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { CONVERSATION_MESSAGES, PARTIAL_REPLY_MARK } from "../../constants/conversation";
import type { TutorBubbleProps } from "../../types/TutorBubbleProps";
import TutorBubbleAction from "./TutorBubbleAction";

/** One tutor reply, with replay (normal and slow, a genuinely lower speaking rate) and its English translation folded away. */
export default function TutorBubble({ text, translation, partial, canReplay, onReplay, onReplaySlow }: TutorBubbleProps) {
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
        <TutorBubbleAction
          disabled={!canReplay}
          hint={canReplay ? PRACTICE_COPY.replayHint : PRACTICE_COPY.replayUnavailableHint}
          label={PRACTICE_COPY.replay}
          onPress={onReplay}
        />
        <TutorBubbleAction
          disabled={!canReplay}
          hint={canReplay ? PRACTICE_COPY.replaySlowHint : PRACTICE_COPY.replayUnavailableHint}
          label={PRACTICE_COPY.replaySlow}
          onPress={onReplaySlow}
        />
        {translation ? (
          <TutorBubbleAction
            expanded={showTranslation}
            label={showTranslation ? PRACTICE_COPY.hideTranslation : PRACTICE_COPY.showTranslation}
            onPress={() => setShowTranslation((shown) => !shown)}
          />
        ) : null}
      </View>
      {translation && showTranslation ? (
        <Text style={{ paddingHorizontal: spacing.xs, color: colors.mutedForeground, fontSize: fontSize.sm }}>{translation}</Text>
      ) : null}
    </View>
  );
}
