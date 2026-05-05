export interface AttachmentViewerImageBodyProps {
  url: string;
  filename: string;
}

export default function AttachmentViewerImageBody({
  url,
  filename,
}: AttachmentViewerImageBodyProps) {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <img
        src={url}
        alt={filename}
        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
        data-testid="attachment-viewer-img"
      />
    </div>
  );
}
