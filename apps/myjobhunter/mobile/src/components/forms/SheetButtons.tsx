import { FormSheetCancelButton, LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { SheetButtonsProps } from "../../types/SheetButtonsProps";

/**
 * Save and Cancel under a FormSheet's fields. Cancel closes the way Back does, asking first if anything
 * typed would be lost; it waits while a save is on its way, and both wait while `disabled`.
 */
export default function SheetButtons({ cancelLabel, submitLabel, submittingLabel, onSubmit, isSubmitting, disabled = false }: SheetButtonsProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
      <LoadingButton disabled={disabled} isLoading={isSubmitting} loadingText={submittingLabel} onPress={onSubmit}>
        {submitLabel}
      </LoadingButton>
      <FormSheetCancelButton disabled={isSubmitting || disabled}>{cancelLabel}</FormSheetCancelButton>
    </View>
  );
}
