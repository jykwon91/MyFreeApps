import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";
import { FormField } from "@platform/mobile";

interface MortgageMoneyFieldProps {
  field: keyof MortgageFormValues;
  label: string;
  value: string;
  onChange: (field: keyof MortgageFormValues, value: string) => void;
  isBusy: boolean;
  error?: string;
  hint?: string;
}

export default function MortgageMoneyField({ field, label, value, onChange, isBusy, error, hint }: MortgageMoneyFieldProps) {
  return <FormField editable={!isBusy} error={error} hint={hint} keyboardType="decimal-pad" label={label} onChangeText={(text) => onChange(field, text)} value={value} />;
}
