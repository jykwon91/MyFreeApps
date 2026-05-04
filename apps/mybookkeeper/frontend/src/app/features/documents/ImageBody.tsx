import type { DocumentBlob } from "@/shared/services/documentService";

export interface ImageBodyProps {
  blob: DocumentBlob;
}

export default function ImageBody({ blob }: ImageBodyProps) {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <img
        src={blob.url}
        alt="Source document"
        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
      />
    </div>
  );
}
