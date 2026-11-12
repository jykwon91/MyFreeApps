import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { RetryPromptProps } from "../../types/RetryPromptProps";

/** The tutor invites the learner to write a corrected sentence again. It can always be skipped. */
export default function RetryPrompt({ prompt, disabled, onTry, onSkip }: RetryPromptProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View
      style={{
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderWidth: 1,
        borderStyle: "dashed",
        borderRadius: radius.md,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{prompt}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <LoadingButton disabled={disabled} onPress={onTry} variant="secondary">
          {PRACTICE_COPY.tryIt}
        </LoadingButton>
        <LoadingButton onPress={onSkip} variant="ghost">
          {PRACTICE_COPY.skip}
        </LoadingButton>
      </View>
    </View>
  );
}
