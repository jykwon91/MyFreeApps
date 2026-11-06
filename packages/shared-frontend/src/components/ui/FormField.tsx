import { useId } from "react";
import FormFieldHeader from "./FormFieldHeader";
import type { FormFieldProps } from "./FormFieldProps";

const HEADER_CLASS = "flex items-center gap-1.5 text-xs font-medium mb-1";

export default function FormField(props: FormFieldProps) {
  const { label, required, highlight, dirty } = props;
  const id = useId();
  const header = <FormFieldHeader label={label} highlight={highlight} dirty={dirty} />;

  if (props.group) {
    return (
      <div role="group" aria-labelledby={required ? `${id} ${id}-required` : id}>
        <span id={id} className={HEADER_CLASS}>
          {header}
          {required && <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>}
        </span>
        {required && <span id={`${id}-required`} className="sr-only">(required)</span>}
        {props.children}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className={HEADER_CLASS}>
        {header}
        {required && <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>}
      </label>
      {props.children({ id, ...(required ? { "aria-required": true as const } : {}) })}
    </div>
  );
}
