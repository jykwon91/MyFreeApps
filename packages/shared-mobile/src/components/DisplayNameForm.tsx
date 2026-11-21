import { characterCounter } from "@platform/core/utils/characterCounter";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { useState } from "react";
import { View } from "react-native";
import { FIELD_PRESETS } from "../constants/fieldPresets";
import { SECURITY_MESSAGES as MESSAGES } from "../constants/security";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../theme/useTheme";
import type { DisplayNameFormProps } from "../types/DisplayNameFormProps";
import FormField from "./FormField";
import LoadingButton from "./LoadingButton";

/**
 * The name, saved with its own button as on the website. A failed save keeps what was typed; one a cache reset called off says
 * nothing. A lost answer can come after the save (see writeOutcome), so it says it isn't sure: saving the same name again is harmless.
 */
export default function DisplayNameForm({ initialName, source }: DisplayNameFormProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const { save: saveName, maxLength } = source;
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = name.trim();
  const problem = tooLongProblem(trimmed, maxLength);
  const canSave = trimmed !== savedName && problem === undefined;

  async function save(): Promise<void> {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await saveName(trimmed);
      setSavedName(trimmed);
      showToast(MESSAGES.displayNameSaved, "success");
    } catch (error) {
      if (!isCancelledRequest(error)) {
        showToast(writeOutcome(error) === "unknown" ? MESSAGES.displayNameSaveUnsure : MESSAGES.displayNameSaveFailed, "error");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <FormField
        {...FIELD_PRESETS.ownName}
        counter={characterCounter(trimmed, maxLength)}
        editable={!isSaving}
        error={problem}
        label={MESSAGES.displayNameLabel}
        onChangeText={setName}
        onSubmitEditing={() => canSave && void save()}
        placeholder={MESSAGES.displayNamePlaceholder}
        returnKeyType="done"
        value={name}
      />
      <LoadingButton disabled={!canSave} isLoading={isSaving} loadingText={MESSAGES.saving} onPress={save}>
        {MESSAGES.save}
      </LoadingButton>
    </View>
  );
}
