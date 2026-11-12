import { characterCounter } from "@platform/core/utils/characterCounter";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { useState } from "react";
import { View } from "react-native";
import { SECURITY_MESSAGES as MESSAGES } from "../constants/security";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../theme/useTheme";
import type { DisplayNameFormProps } from "../types/DisplayNameFormProps";
import FormField from "./FormField";
import LoadingButton from "./LoadingButton";

/** The name, saved with its own button as on the website. A failed save keeps what was typed. */
export default function DisplayNameForm({ initialName, source }: DisplayNameFormProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const { save: saveName, maxLength } = source;
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = name.trim();
  const problem = tooLongProblem(trimmed, maxLength);

  async function save(): Promise<void> {
    setIsSaving(true);
    try {
      await saveName(trimmed);
      setSavedName(trimmed);
      showToast(MESSAGES.displayNameSaved, "success");
    } catch {
      showToast(MESSAGES.displayNameSaveFailed, "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <FormField
        autoCapitalize="words"
        autoComplete="name"
        counter={characterCounter(trimmed, maxLength)}
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
