import { ExternalLink } from "lucide-react";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";

interface Props {
  url: string;
  filename: string;
  contentType: string;
  onClose: () => void;
}

/**
 * Generic inline viewer for lease attachments.
 *
 * Takes a presigned URL directly (no API fetch needed — the URL is already
 * available from the attachment list response). Renders:
 * - PDF → iframe
 * - image/* → <img>
 * - anything else → download-only message (DOCX, etc.)
 */
export default function AttachmentViewer({ url, filename, contentType, onClose }: Props) {
  const isPdf = contentType === "application/pdf";
  const isImage = contentType.startsWith("image/");

  return (
    <Panel position="center" onClose={onClose}>
      <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-muted-foreground truncate max-w-xs" title={filename}>
            {filename}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
            data-testid="attachment-viewer-open-in-new-tab"
          >
            <ExternalLink size={12} />
            Open in new tab
          </a>
        </div>
        <PanelCloseButton onClose={onClose} label="Close viewer" />
      </header>

      <div className="flex-1 min-h-0 overflow-auto bg-muted/50" data-testid="attachment-viewer-body">
        {isPdf ? (
          <div className="h-full bg-white rounded-b-lg">
            <iframe
              src={url}
              className="w-full h-full"
              title={filename}
              data-testid="attachment-viewer-iframe"
            />
          </div>
        ) : isImage ? (
          <div className="flex items-center justify-center h-full p-4">
            <img
              src={url}
              alt={filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
              data-testid="attachment-viewer-img"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center" data-testid="attachment-viewer-download-fallback">
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
        )}
      </div>
    </Panel>
  );
}
