import { FormField, FormSheet, LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeCustomSheetProps } from "../../types/ResumeCustomSheetProps";

/** Write my own: the website's inline rewrite box, as a sheet over the suggestion. */
export default function ResumeCustomSheet({ isOpen, value, onChange, onClose, onSubmit, isSubmitting, failure }: ResumeCustomSheetProps) {
  const { spacing } = useTheme();
  return (
    <FormSheet failure={failure} isOpen={isOpen} onRequestClose={() => (isSubmitting ? undefined : onClose())} title={MESSAGES.customTitle}>
      <FormField autoFocus editable={!isSubmitting} label={MESSAGES.customLabel} multiline onChangeText={onChange} placeholder={MESSAGES.customPlaceholder} value={value} />
      <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
        <LoadingButton disabled={!value.trim()} isLoading={isSubmitting} loadingText={MESSAGES.accepting} onPress={onSubmit}>
          {MESSAGES.useMine}
        </LoadingButton>
        <LoadingButton disabled={isSubmitting} onPress={onClose} variant="ghost">
          {MESSAGES.cancel}
        </LoadingButton>
      </View>
    </FormSheet>
  );
}
