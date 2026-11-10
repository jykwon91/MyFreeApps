export interface SheetButtonsProps {
  cancelLabel: string;
  onCancel: () => void;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: () => void | Promise<void>;
  isSubmitting: boolean;
  /** Holds both buttons, as while a file picker is open. */
  disabled?: boolean;
}
