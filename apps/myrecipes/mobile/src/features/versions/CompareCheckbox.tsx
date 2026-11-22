import { COMPARE_CHECKBOX_SIZE } from "../../constants/versions";
import type { CompareCheckboxProps } from "../../types/CompareCheckboxProps";
import CheckboxBox from "../checkbox/CheckboxBox";

/** The box beside a version while picking two to compare. The row it sits in says whether it's checked. */
export default function CompareCheckbox({ isChecked, isDisabled }: CompareCheckboxProps) {
  return <CheckboxBox isChecked={isChecked} isDisabled={isDisabled} size={COMPARE_CHECKBOX_SIZE} variant="filled" />;
}
