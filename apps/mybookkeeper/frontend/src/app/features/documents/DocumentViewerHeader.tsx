import type { DocumentBlob } from "@/shared/services/documentService";
import type { DocumentViewMode } from "@/shared/types/document/document-view-mode";
import { PanelCloseButton } from "@/shared/components/ui/Panel";
import OpenInNewTabLink from "./OpenInNewTabLink";

export interface DocumentViewerHeaderProps {
  blob: DocumentBlob | null;
  mode: DocumentViewMode;
  onClose: () => void;
}

export default function DocumentViewerHeader({
  blob,
  mode,
  onClose,
}: DocumentViewerHeaderProps) {
  // size === 0 is a real signal (empty blob) — must be explicit, not truthy
  const showOpenInNewTab = blob && blob.size > 0 && mode !== "payment";
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-card">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium text-muted-foreground">Source document</span>
        {showOpenInNewTab ? <OpenInNewTabLink url={blob.url} /> : null}
      </div>
      <PanelCloseButton onClose={onClose} label="Close viewer" />
    </header>
  );
}
