import { ExternalLink } from "lucide-react";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";
import { useAttachmentViewMode } from "./useAttachmentViewMode";
import AttachmentViewerBody from "./AttachmentViewerBody";

export interface AttachmentViewerProps {
  /**
   * Presigned URL or empty string when the underlying object is missing.
   * Empty triggers the "unavailable" body and suppresses the
   * "Open in new tab" link in the header.
   */
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
 * - URL is empty (storage object missing) → "no longer available" message
 */
export default function AttachmentViewer({
  url,
  filename,
  contentType,
  onClose,
}: AttachmentViewerProps) {
  const mode = useAttachmentViewMode({ url, contentType });

  return (
    <Panel position="center" onClose={onClose}>
      <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="text-sm font-medium text-muted-foreground truncate max-w-xs"
            title={filename}
          >
            {filename}
          </span>
          {url ? (
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
          ) : null}
        </div>
        <PanelCloseButton onClose={onClose} label="Close viewer" />
      </header>

      <div
        className="flex-1 min-h-0 overflow-auto bg-muted/50"
        data-testid="attachment-viewer-body"
      >
        <AttachmentViewerBody mode={mode} url={url} filename={filename} />
      </div>
    </Panel>
  );
}
