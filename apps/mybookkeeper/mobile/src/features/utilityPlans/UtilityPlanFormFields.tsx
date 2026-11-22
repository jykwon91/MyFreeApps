import { UTILITY_PLAN_RATE_TYPE_HINTS } from "@mybookkeeper/api-client/constants/utilityPlanRateTypes";
import { UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import { ChoiceGroup, FIELD_PRESETS, PickerField, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import {
  UTILITY_PLAN_ACCOUNT_MAX_LENGTH,
  UTILITY_PLAN_FORM_MESSAGES as MESSAGES,
  UTILITY_PLAN_TEXT_MAX_LENGTH,
} from "../../constants/utilityPlanForm";
import { UTILITY_PLAN_RATE_TYPE_OPTIONS } from "../../constants/utilityPlanRateTypeOptions";
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
  const money = { ...fields, preset: FIELD_PRESETS.decimal };
  const today = new Date();

  return (
    <>
      <PickerField disabled={isBusy} label={MESSAGES.service} onPress={onPickService} valueLabel={UTILITY_SERVICE_TYPE_LABELS[values.serviceType]} />

      <View style={{ gap: spacing.xs }}>
        <ChoiceGroup disabled={isBusy} error={problems.rateType} label={MESSAGES.rateType} onChange={(choice) => onChange("rateType", choice)} options={UTILITY_PLAN_RATE_TYPE_OPTIONS} required value={values.rateType} />
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{UTILITY_PLAN_RATE_TYPE_HINTS[values.rateType]}</Text>
      </View>

      <UtilityPlanTextField {...fields} field="providerName" label={MESSAGES.provider} maxLength={UTILITY_PLAN_TEXT_MAX_LENGTH} placeholder={MESSAGES.providerPlaceholder} required />
      <UtilityPlanTextField {...fields} field="planName" label={MESSAGES.planName} maxLength={UTILITY_PLAN_TEXT_MAX_LENGTH} placeholder={MESSAGES.planNamePlaceholder} />
      <UtilityPlanTextField {...fields} field="accountNumber" preset={FIELD_PRESETS.code} label={MESSAGES.accountNumber} maxLength={UTILITY_PLAN_ACCOUNT_MAX_LENGTH} placeholder={MESSAGES.accountNumberPlaceholder} />

      <UtilityPlanTextField {...money} field="energyCharge" label={MESSAGES.energyCharge} />
      <UtilityPlanTextField {...money} field="tduCharge" label={MESSAGES.tduCharge} />
      <UtilityPlanTextField {...money} field="avgPrice" label={MESSAGES.avgPrice} />
      <UtilityPlanTextField {...money} field="monthlyBase" label={MESSAGES.monthlyBase} />

      <UtilityPlanTextField {...fields} field="termMonths" preset={FIELD_PRESETS.wholeNumber} label={MESSAGES.termMonths} />
      <UtilityPlanDateField field="serviceStartDate" label={MESSAGES.serviceStart} onChange={onChange} problems={problems} isBusy={isBusy} today={today} values={values} />
      <UtilityPlanDateField field="termEndDate" label={MESSAGES.termEnds} onChange={onChange} problems={problems} isBusy={isBusy} today={today} values={values} />
      <UtilityPlanTextField {...money} field="etf" label={MESSAGES.earlyTerminationFee} />

      <UtilityPlanUsageFields {...fields} />
    </>
  );
}
