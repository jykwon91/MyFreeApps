import { getFormLabel } from "@/shared/lib/tax-config";

export { getFormLabel };

interface Props {
  formName: string;
  className?: string;
}

export default function FormNameLabel({ formName, className }: Props) {
  return <span className={className}>{getFormLabel(formName)}</span>;
}
