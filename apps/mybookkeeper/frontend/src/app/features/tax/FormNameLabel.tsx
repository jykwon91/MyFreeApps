import { getFormLabel } from "@/shared/lib/tax-config";

export interface FormNameLabelProps {
  formName: string;
  className?: string;
}

export default function FormNameLabel({ formName, className }: FormNameLabelProps) {
  return <span className={className}>{getFormLabel(formName)}</span>;
}
