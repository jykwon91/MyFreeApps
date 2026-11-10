import { PickerField } from "@platform/mobile";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../../constants/addApplication";
import type { ManualSourceFieldsProps } from "../../types/ManualSourceFieldsProps";

/** Typing it in starts with the company; choosing one opens the rest of the form. */
export default function ManualSourceFields({ onChooseCompany }: ManualSourceFieldsProps) {
  return <PickerField hint={MESSAGES.manualHint} label={MESSAGES.companyLabel} onPress={onChooseCompany} valueLabel={MESSAGES.chooseCompany} />;
}
