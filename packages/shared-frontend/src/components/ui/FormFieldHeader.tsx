import type { FormFieldHeaderProps } from "./FormFieldHeaderProps";

/** The label row's contents. Only the label text is part of the field's name. */
export default function FormFieldHeader({ label, highlight, dirty }: FormFieldHeaderProps) {
  return (
    <>
      {highlight && <span aria-hidden="true" className="shrink-0 w-1.5 h-1.5 rounded-full bg-orange-400" />}
      {dirty && !highlight && <span aria-hidden="true" className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400" />}
      <span>{label}</span>
      {dirty && <span aria-hidden="true" className="text-blue-400 text-[10px] ml-1">modified</span>}
    </>
  );
}
