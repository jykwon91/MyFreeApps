import { LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { SheetButtonsProps } from "../../types/SheetButtonsProps";

/** Save and Cancel under a sheet's fields. Cancel waits while a save is on its way, and both wait while `disabled`. */
export default function SheetButtons({ cancelLabel, onCancel, submitLabel, submittingLabel, onSubmit, isSubmitting, disabled = false }: SheetButtonsProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
      <LoadingButton disabled={disabled} isLoading={isSubmitting} loadingText={submittingLabel} onPress={onSubmit}>
        {submitLabel}
      </LoadingButton>
      <LoadingButton disabled={isSubmitting || disabled} onPress={onCancel} variant="ghost">
        {cancelLabel}
      </LoadingButton>
    </View>
  );
}
