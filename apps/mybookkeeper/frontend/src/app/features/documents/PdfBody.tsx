import type { DocumentBlob } from "@/shared/services/documentService";

export interface PdfBodyProps {
  blob: DocumentBlob;
}

export default function PdfBody({ blob }: PdfBodyProps) {
  return (
    <div className="h-full bg-white rounded-b-lg">
      <iframe src={blob.url} className="w-full h-full" title="Source document" />
    </div>
  );
}
