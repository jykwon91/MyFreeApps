import { PickerField } from "@platform/mobile";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../../constants/addApplication";
import { companyFieldHint } from "../../lib/companyFieldHint";
import type { CompanyFieldProps } from "../../types/CompanyFieldProps";

/** The company it'll be saved under, and whether it was matched, added or chosen. Opens the picker to change it. */
export default function CompanyField({ company, onPress, disabled }: CompanyFieldProps) {
  return (
    <PickerField
      disabled={disabled}
      hint={companyFieldHint(company)}
      label={MESSAGES.companyLabel}
      onPress={onPress}
      valueLabel={company.name || MESSAGES.chooseCompany}
    />
  );
}
