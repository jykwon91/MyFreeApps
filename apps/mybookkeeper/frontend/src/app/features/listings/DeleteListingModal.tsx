import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";

export interface DeleteListingModalProps {
  open: boolean;
  listingTitle: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteListingModal({
  open,
  listingTitle,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteListingModalProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Delete this listing?"
      description={
        `"${listingTitle}" will be removed from your listings. ` +
        "Photos and external IDs come along with it. This can't be undone."
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
