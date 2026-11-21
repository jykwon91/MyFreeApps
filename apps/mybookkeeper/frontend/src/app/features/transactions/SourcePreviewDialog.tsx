import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ModalDialog } from "@platform/ui";
import type { SourcePreview } from "@/shared/types/transaction/source-preview";
import SourcePreviewBody from "./SourcePreviewBody";

export interface SourcePreviewDialogProps {
  preview: SourcePreview;
  fileName: string | null;
  onClose: () => void;
}

/** The transaction's source document, over the transaction panel. Escape, the close button or a click on the backdrop closes it. */
export default function SourcePreviewDialog({ preview, fileName, onClose }: SourcePreviewDialogProps) {
  return (
    <ModalDialog
      testId="source-preview-dialog"
      overlayTestId="source-preview-backdrop"
      onClose={onClose}
      closeOnBackdropClick
      overlayClassName="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      panelClassName="bg-card rounded-lg shadow-xl max-w-3xl max-h-[80vh] w-full mx-4 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Dialog.Title className="text-sm font-medium truncate">{fileName ?? "Source document"}</Dialog.Title>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close source document"
          className="text-muted-foreground hover:text-foreground p-1"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="overflow-auto max-h-[calc(80vh-3rem)] flex items-center justify-center">
        <SourcePreviewBody mode={preview.type} url={preview.url} fileName={fileName} />
      </div>
    </ModalDialog>
  );
}
