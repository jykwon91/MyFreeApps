export interface AttachmentViewerPdfBodyProps {
  url: string;
  filename: string;
}

export default function AttachmentViewerPdfBody({
  url,
  filename,
}: AttachmentViewerPdfBodyProps) {
  return (
    <div className="h-full bg-white rounded-b-lg">
      <iframe
        src={url}
        className="w-full h-full"
        title={filename}
        data-testid="attachment-viewer-iframe"
      />
    </div>
  );
}
