import { FormField, FormSheet, FormSheetCancelButton, LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeCustomSheetProps } from "../../types/ResumeCustomSheetProps";

/** Write my own: the website's inline rewrite box, as a sheet over the suggestion. */
export default function ResumeCustomSheet({ isOpen, value, onChange, onClose, onSubmit, isSubmitting, failure }: ResumeCustomSheetProps) {
  const { spacing } = useTheme();
  return (
    <FormSheet failure={failure} isBusy={isSubmitting} isOpen={isOpen} onRequestClose={onClose} title={MESSAGES.customTitle}>
      <FormField autoFocus editable={!isSubmitting} label={MESSAGES.customLabel} multiline onChangeText={onChange} placeholder={MESSAGES.customPlaceholder} value={value} />
      <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
        <LoadingButton disabled={!value.trim()} isLoading={isSubmitting} loadingText={MESSAGES.accepting} onPress={onSubmit}>
          {MESSAGES.useMine}
        </LoadingButton>
        <FormSheetCancelButton>{MESSAGES.cancel}</FormSheetCancelButton>
      </View>
    </FormSheet>
  );
}
