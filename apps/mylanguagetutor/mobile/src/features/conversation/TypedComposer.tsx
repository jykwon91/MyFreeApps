import { MAX_TURN_CHARS } from "@mylanguagetutor/api-client/constants/turnLimits";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { FormField, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import type { TypedComposerProps } from "../../types/TypedComposerProps";

/**
 * Where the learner writes their answer; each keystroke counts as activity, which keeps the screen
 * awake. The field stays editable while a reply streams, so the keyboard stays up
 * for the next answer; Send waits.
 */
export default function TypedComposer({ label, placeholder, busy, onSend, onActivity, inputRef }: TypedComposerProps) {
  const { spacing } = useTheme();
  const [text, setText] = useState("");
  const trimmed = text.trim();

  const edit = (value: string) => {
    setText(value);
    onActivity();
  };

  const submit = () => {
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <FormField
        autoComplete="off"
        label={label}
        maxLength={MAX_TURN_CHARS}
        onChangeText={edit}
        onSubmitEditing={submit}
        placeholder={placeholder}
        ref={inputRef}
        returnKeyType="send"
        submitBehavior="submit"
        value={text}
      />
      <LoadingButton disabled={!trimmed} isLoading={busy} loadingText={PRACTICE_COPY.sending} onPress={submit}>
        {PRACTICE_COPY.send}
      </LoadingButton>
    </View>
  );
}
