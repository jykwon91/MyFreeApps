import { useEffect, useState } from "react";

export interface AttachmentViewerPdfBodyProps {
  url: string;
  filename: string;
}

/**
 * The presigned URL carries ``Content-Disposition: attachment; filename=…``
 * (PR #392) so saved-to-disk downloads use the friendly filename. The same
 * header forces browsers to download — not render inline — when the URL is
 * loaded directly into an ``<iframe src>``. To preview the PDF in the modal
 * we fetch the bytes ourselves and feed the iframe a blob: URL, which
 * always renders inline regardless of the original response disposition.
 */
export default function AttachmentViewerPdfBody({
  url,
  filename,
}: AttachmentViewerPdfBodyProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let createdUrl: string | null = null;
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.statusText)))
      .then((blob) => {
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      })
      .catch(() => {
        // Modal already shows the "Open in new tab" affordance; silent here.
      });
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  if (!blobUrl) {
    return (
      <div
        className="h-full bg-white rounded-b-lg flex items-center justify-center"
        data-testid="attachment-viewer-pdf-loading"
      >
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white rounded-b-lg">
      <iframe
        src={blobUrl}
        className="w-full h-full"
        title={filename}
        data-testid="attachment-viewer-iframe"
      />
    </div>
  );
}
