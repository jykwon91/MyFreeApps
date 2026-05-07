import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import LeaseAttachmentDropzone from "@/app/features/leases/LeaseAttachmentDropzone";

export interface LeaseQuickUploadModalProps {
  leaseId: string;
  leaseShortId: string;
  open: boolean;
  onClose: () => void;
}

export default function LeaseQuickUploadModal({
  leaseId,
  leaseShortId,
  open,
  onClose,
}: LeaseQuickUploadModalProps) {
  function handleUploaded() {
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background rounded-lg shadow-lg p-6 w-full max-w-md"
          data-testid="lease-quick-upload-modal"
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold">
              Add documents to Lease {leaseShortId}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <LeaseAttachmentDropzone leaseId={leaseId} onUploaded={handleUploaded} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
