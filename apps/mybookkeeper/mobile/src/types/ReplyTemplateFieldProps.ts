import type { FormFieldProps } from "@platform/mobile";

/** What a Subject or Message field needs so a variable can go in at its cursor. */
export type ReplyTemplateFieldProps = Pick<FormFieldProps, "ref" | "onFocus" | "onSelectionChange" | "selection">;
