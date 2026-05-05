export interface AttachmentViewerOtherBodyProps {
  url: string;
  filename: string;
}

export default function AttachmentViewerOtherBody({
  url,
  filename,
}: AttachmentViewerOtherBodyProps) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center"
      data-testid="attachment-viewer-download-fallback"
    >
      <p className="text-sm text-muted-foreground">
        This file type cannot be previewed in the browser.
      </p>
      <a
        href={url}
        download={filename}
        className="text-sm text-primary hover:underline font-medium"
      >
        Download {filename}
      </a>
    </div>
  );
}
