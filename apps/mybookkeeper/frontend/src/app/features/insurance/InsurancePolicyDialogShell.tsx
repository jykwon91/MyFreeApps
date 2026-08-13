import { X } from "lucide-react";

export interface InsurancePolicyDialogShellProps {
  title: string;
  testId: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Modal chrome shared by the add and edit insurance-policy dialogs. */
export default function InsurancePolicyDialogShell({
  title,
  testId,
  onClose,
  children,
}: InsurancePolicyDialogShellProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      data-testid={testId}
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
