import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";

export interface DeleteVendorModalProps {
  open: boolean;
  vendorName: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog before hard-deleting a vendor (PR 4.2).
 *
 * Mirrors ``DeleteListingModal``. The copy explicitly mentions that any
 * linked transactions stay put — only the rolodex link is detached. This
 * matches the backend behaviour: ``Transaction.vendor_id`` is set to NULL
 * via an explicit UPDATE before the vendor row is removed.
 */
export default function DeleteVendorModal({
  open,
  vendorName,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteVendorModalProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Delete this vendor?"
      description={
        `"${vendorName}" will be removed from your rolodex. ` +
        "Any transactions you've already linked to them stay put — they'll just no longer be tagged with this vendor. This can't be undone."
      }
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="danger"
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
