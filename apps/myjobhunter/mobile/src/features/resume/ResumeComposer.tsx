import { FormField, LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeComposerProps } from "../../types/ResumeComposerProps";

/**
 * The chat box under the suggestion. Whatever's typed (a style note, an answer to a question, a
 * new direction) asks for another take with it; the other button asks with no note. Each shows
 * its own wait from the tap until the new take is in, since both return the request's promise.
 */
export default function ResumeComposer({ value, onChange, onSend, onRegenerate, isBusy, isClarify }: ResumeComposerProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <FormField
        editable={!isBusy}
        label={MESSAGES.messageLabel}
        multiline
        onChangeText={onChange}
        placeholder={isClarify ? MESSAGES.answerPlaceholder : MESSAGES.messagePlaceholder}
        value={value}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LoadingButton disabled={isBusy} loadingText={MESSAGES.askingButton} onPress={onRegenerate} style={{ flex: 1 }} variant="secondary">
          {MESSAGES.anotherTake}
        </LoadingButton>
        <LoadingButton disabled={isBusy || !value.trim()} loadingText={MESSAGES.sendingButton} onPress={onSend} style={{ flex: 1 }}>
          {MESSAGES.send}
        </LoadingButton>
      </View>
    </View>
  );
}
