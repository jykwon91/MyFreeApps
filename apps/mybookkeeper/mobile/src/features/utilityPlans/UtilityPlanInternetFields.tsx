import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { UTILITY_PLAN_FORM_MESSAGES as MESSAGES } from "../../constants/utilityPlanForm";
import type { UtilityPlanFieldsProps } from "../../types/UtilityPlanFieldsProps";
import UtilityPlanTextField from "./UtilityPlanTextField";

/**
 * The terms that price an internet plan rather than a metered one. Hiding these for other
 * services doesn't clear them, so correcting a plan's service keeps what it recorded.
 */
export default function UtilityPlanInternetFields(props: UtilityPlanFieldsProps) {
  const { colors, fontSize } = useTheme();
  const money = { ...props, keyboardType: "decimal-pad" as const };
  const whole = { ...props, keyboardType: "number-pad" as const };
  return (
    <>
      <UtilityPlanTextField {...money} field="postPromoMonthly" label={MESSAGES.postPromo} />
      <UtilityPlanTextField {...money} field="equipmentFeeMonthly" label={MESSAGES.equipmentFee} />
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.postPromoHint}</Text>
      <UtilityPlanTextField {...whole} field="downloadMbps" label={MESSAGES.download} />
      <UtilityPlanTextField {...whole} field="uploadMbps" label={MESSAGES.upload} />
      <UtilityPlanTextField {...whole} field="dataCapGb" label={MESSAGES.dataCap} />
    </>
  );
}
