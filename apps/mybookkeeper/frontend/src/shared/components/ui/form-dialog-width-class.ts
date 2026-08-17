import type { FormDialogWidth } from "@/shared/types/ui/form-dialog-width";

/** Tailwind max-width per {@link FormDialogWidth}. */
export const FORM_DIALOG_WIDTH_CLASS: Record<FormDialogWidth, string> = {
  narrow: "max-w-lg",
  wide: "max-w-3xl",
};
