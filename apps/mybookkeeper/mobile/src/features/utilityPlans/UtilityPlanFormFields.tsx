import { UTILITY_PLAN_RATE_TYPES, UTILITY_PLAN_RATE_TYPE_HINTS, UTILITY_PLAN_RATE_TYPE_LABELS } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-type";
import { UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import { OptionRow, PickerField, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import {
  UTILITY_PLAN_ACCOUNT_MAX_LENGTH,
  UTILITY_PLAN_FORM_MESSAGES as MESSAGES,
  UTILITY_PLAN_TEXT_MAX_LENGTH,
} from "../../constants/utilityPlanForm";
import type { UtilityPlanFieldsProps } from "../../types/UtilityPlanFieldsProps";
import UtilityPlanDateField from "./UtilityPlanDateField";
import UtilityPlanTextField from "./UtilityPlanTextField";
import UtilityPlanUsageFields from "./UtilityPlanUsageFields";

interface UtilityPlanFormFieldsProps extends UtilityPlanFieldsProps {
  onPickService: () => void;
}

/** Every field of a plan except the property it belongs to, in the order someone reading a plan would find them. */
export default function UtilityPlanFormFields({ onPickService, ...fields }: UtilityPlanFormFieldsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { values, onChange, problems, isBusy } = fields;
  const money = { ...fields, keyboardType: "decimal-pad" as const };
  const today = new Date();

  return (
    <>
      <PickerField disabled={isBusy} label={MESSAGES.service} onPress={onPickService} valueLabel={UTILITY_SERVICE_TYPE_LABELS[values.serviceType]} />

      <View accessibilityLabel={MESSAGES.rateType} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{`${MESSAGES.rateType} *`}</Text>
        {UTILITY_PLAN_RATE_TYPES.map((choice) => (
          <OptionRow
            isSelected={values.rateType === choice}
            key={choice}
            label={UTILITY_PLAN_RATE_TYPE_LABELS[choice]}
            onPress={() => {
              if (!isBusy) onChange("rateType", choice);
            }}
          />
        ))}
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{UTILITY_PLAN_RATE_TYPE_HINTS[values.rateType]}</Text>
      </View>

      <UtilityPlanTextField {...fields} field="providerName" label={MESSAGES.provider} maxLength={UTILITY_PLAN_TEXT_MAX_LENGTH} placeholder={MESSAGES.providerPlaceholder} required />
      <UtilityPlanTextField {...fields} field="planName" label={MESSAGES.planName} maxLength={UTILITY_PLAN_TEXT_MAX_LENGTH} placeholder={MESSAGES.planNamePlaceholder} />
      <UtilityPlanTextField {...fields} field="accountNumber" label={MESSAGES.accountNumber} maxLength={UTILITY_PLAN_ACCOUNT_MAX_LENGTH} placeholder={MESSAGES.accountNumberPlaceholder} />

      <UtilityPlanTextField {...money} field="energyCharge" label={MESSAGES.energyCharge} />
      <UtilityPlanTextField {...money} field="tduCharge" label={MESSAGES.tduCharge} />
      <UtilityPlanTextField {...money} field="avgPrice" label={MESSAGES.avgPrice} />
      <UtilityPlanTextField {...money} field="monthlyBase" label={MESSAGES.monthlyBase} />

      <UtilityPlanTextField {...fields} field="termMonths" keyboardType="number-pad" label={MESSAGES.termMonths} />
      <UtilityPlanDateField field="serviceStartDate" label={MESSAGES.serviceStart} onChange={onChange} problems={problems} today={today} values={values} />
      <UtilityPlanDateField field="termEndDate" label={MESSAGES.termEnds} onChange={onChange} problems={problems} today={today} values={values} />
      <UtilityPlanTextField {...money} field="etf" label={MESSAGES.earlyTerminationFee} />

      <UtilityPlanUsageFields {...fields} />
    </>
  );
}
