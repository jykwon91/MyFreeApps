import { DISPLAY_NAME_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { tooLongProblem } from "@myjobhunter/api-client/utils/tooLongProblem";
import { useUpdateCurrentUserMutation } from "@platform/core/store/userApi";
import { FormField, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import { SECURITY_MESSAGES as MESSAGES } from "../../constants/security";
import type { DisplayNameFormProps } from "../../types/DisplayNameFormProps";

/** The name, saved with its own button as on the website. A failed save keeps what was typed. */
export default function DisplayNameForm({ initialName }: DisplayNameFormProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const [updateCurrentUser, { isLoading: isSaving }] = useUpdateCurrentUserMutation();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);

  const trimmed = name.trim();
  const problem = tooLongProblem(trimmed, DISPLAY_NAME_MAX_LENGTH);

  async function save(): Promise<void> {
    try {
      await updateCurrentUser({ display_name: trimmed }).unwrap();
      setSavedName(trimmed);
      showToast(MESSAGES.displayNameSaved, "success");
    } catch {
      showToast(MESSAGES.displayNameSaveFailed, "error");
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <FormField
        autoCapitalize="words"
        autoComplete="name"
        counter={characterCounter(trimmed, DISPLAY_NAME_MAX_LENGTH)}
        editable={!isSaving}
        error={problem}
        label={MESSAGES.displayNameLabel}
        onChangeText={setName}
        placeholder={MESSAGES.displayNamePlaceholder}
        returnKeyType="done"
        value={name}
      />
      <LoadingButton disabled={trimmed === savedName || problem !== undefined} isLoading={isSaving} loadingText={MESSAGES.saving} onPress={save}>
        {MESSAGES.save}
      </LoadingButton>
    </View>
  );
}
