import type { DocumentBlob } from "@/shared/services/documentService";

export interface GenericBlobBodyProps {
  blob: DocumentBlob;
}

/**
 * Shows any file that isn't a photo or a PDF (plain text, a CSV, or a file
 * the browser can only download). The frame is sandboxed: whatever the file
 * turns out to be, it can't run script or act as this site. Downloads stay
 * allowed so a Word or Excel file still saves the way it did before.
 */
export default function GenericBlobBody({ blob }: GenericBlobBodyProps) {
  return (
    <iframe
      src={blob.url}
      sandbox="allow-downloads"
      className="w-full h-full rounded-b-lg"
      title="Source document"
    />
  );
}
