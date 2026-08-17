import { X } from "lucide-react";
import { FORM_DIALOG_WIDTH_CLASS } from "./form-dialog-width-class";
import type { FormDialogWidth } from "@/shared/types/ui/form-dialog-width";

export interface FormDialogShellProps {
  title: string;
  testId: string;
  onClose: () => void;
  /** Defaults to "narrow" — widen only for a form long enough to need sections. */
  width?: FormDialogWidth;
  children: React.ReactNode;
}

/**
 * Modal chrome for the app's form dialogs.
 *
 * Width is a prop rather than a fixed value because a dialog narrower than its
 * content is a real cost: the insurance and utility-plan forms pair their
 * fields two to a row, and at a single column those rows wrap into a tall
 * ribbon that has to be scrolled past to reach the save button.
 */
export default function FormDialogShell({
  title,
  testId,
  onClose,
  width = "narrow",
  children,
}: FormDialogShellProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      data-testid={testId}
    >
      <div
        className={`bg-background rounded-lg shadow-lg w-full ${FORM_DIALOG_WIDTH_CLASS[width]} max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
