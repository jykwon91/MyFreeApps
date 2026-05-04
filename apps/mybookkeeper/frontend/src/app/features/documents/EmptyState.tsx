export default function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center"
      data-testid="document-empty"
    >
      <p className="text-sm text-destructive">
        This document has no content available.
      </p>
      <p className="text-xs text-muted-foreground">
        The file may have been removed from storage. Try re-uploading the document.
      </p>
    </div>
  );
}
