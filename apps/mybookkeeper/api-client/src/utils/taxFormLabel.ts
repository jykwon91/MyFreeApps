import { FORM_LABELS } from "../constants/taxForms";

export function getFormLabel(formName: string): string {
  return FORM_LABELS[formName] ?? formName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
