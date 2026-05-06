/**
 * Body shown by the AttachmentViewer when the underlying storage object
 * is gone. Plain centered muted text — not a destructive alert. The
 * filename is rendered as the title in the modal header (handled by
 * AttachmentViewer); this body just explains why nothing is loading.
 */
export default function AttachmentViewerUnavailableBody() {
  return (
    <div
      className="flex h-full items-center justify-center p-8 text-center"
      data-testid="attachment-viewer-unavailable-body"
    >
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          This document is no longer available.
        </p>
        <p className="text-xs text-muted-foreground/70">
          The file may have been removed from storage. You can delete the row
          and re-upload the original from the lease detail page.
        </p>
      </div>
    </div>
  );
}
