import type { DocumentBlob } from "@/shared/services/documentService";

export interface GenericBlobBodyProps {
  blob: DocumentBlob;
}

export default function GenericBlobBody({ blob }: GenericBlobBodyProps) {
  return (
    <iframe
      src={blob.url}
      className="w-full h-full rounded-b-lg"
      title="Source document"
    />
  );
}
