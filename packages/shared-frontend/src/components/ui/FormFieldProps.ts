import type { ReactNode } from "react";
import type { FormFieldControlProps } from "./FormFieldControlProps";

/**
 * One control: children is a function that receives the props linking the
 * control to the label. Several controls (chips, tiles, a checkbox with its
 * own label): pass `group` and plain children; the label names the group.
 */
export type FormFieldProps = {
  label: string;
  required?: boolean;
  highlight?: boolean;
  dirty?: boolean;
} &
  (
    | { group?: false; children: (field: FormFieldControlProps) => ReactNode }
    | { group: true; children: ReactNode }
  );
