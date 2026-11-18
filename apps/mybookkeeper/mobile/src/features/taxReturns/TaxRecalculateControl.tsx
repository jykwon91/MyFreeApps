import { LoadingButton, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";
import type { TaxRecalculateControlProps } from "../../types/TaxRecalculateControlProps";

/** Admins can recalculate; others are told why an out-of-date return stays that way. */
export default function TaxRecalculateControl({ isAdmin, needsRecompute, disabled, isRecalculating, onRecalculate }: TaxRecalculateControlProps) {
  const { colors, fontSize } = useTheme();
  if (isAdmin) {
    return (
      <LoadingButton disabled={disabled} isLoading={isRecalculating} loadingText={MESSAGES.recalculating} onPress={onRecalculate} variant="secondary">
        {MESSAGES.recalculate}
      </LoadingButton>
    );
  }
  if (!needsRecompute) return null;
  return <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.adminsOnly}</Text>;
}
