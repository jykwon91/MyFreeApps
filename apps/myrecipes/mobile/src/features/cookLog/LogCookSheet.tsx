import { COOK_LOG_MESSAGES as SHARED, COOK_NOTES_MAX_LENGTH } from "@myrecipes/api-client/constants/cookLog";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, FormSheet, LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COOK_LOG_PHONE_MESSAGES as MESSAGES } from "../../constants/cookLog";
import { MULTILINE_MIN_HEIGHT } from "../../constants/newRecipe";
import type { LogCookSheetProps } from "../../types/LogCookSheetProps";
import StarRatingInput from "./StarRatingInput";
import { useLogCookForm } from "./useLogCookForm";

/** The website's "I made it" dialog: how this version turned out, as a rating and notes. */
export default function LogCookSheet({ recipeId, versionId, versionNumber, onClose }: LogCookSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const form = useLogCookForm(recipeId, versionId, onClose);

  function close(): void {
    if (!form.isSaving) onClose();
  }

  return (
    <FormSheet failure={form.failure} isOpen onRequestClose={close} title={SHARED.logTitle}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{SHARED.logIntro(versionNumber)}</Text>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.foreground, fontSize: fontSize.xs, fontWeight: "500" }}>{SHARED.ratingLabel}</Text>
        <StarRatingInput disabled={form.isSaving} onChange={form.setRating} value={form.values.rating} />
      </View>
      <FormField
        autoCapitalize="sentences"
        counter={characterCounter(form.values.notes.trim(), COOK_NOTES_MAX_LENGTH)}
        editable={!form.isSaving}
        error={form.notesProblem}
        inputStyle={{ minHeight: MULTILINE_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
        label={`${SHARED.notesLabel} ${SHARED.notesOptional}`}
        multiline
        onChangeText={form.setNotes}
        placeholder={SHARED.notesPlaceholder}
        value={form.values.notes}
      />
      <LoadingButton isLoading={form.isSaving} loadingText={MESSAGES.saving} onPress={form.save}>
        {SHARED.save}
      </LoadingButton>
      <LoadingButton disabled={form.isSaving} onPress={close} variant="ghost">
        {MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
