import { Loader2 } from "lucide-react";
import type { DocumentBlob } from "@/shared/services/documentService";

export function LoadingState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-3 text-foreground"
    >
      <Loader2 size={32} className="animate-spin text-primary" />
      <p className="text-sm">Loading document...</p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <p
      className="flex items-center justify-center h-full text-sm text-destructive px-4 text-center"
      data-testid="document-error"
    >
      {message}
    </p>
  );
}

export function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center"
      data-testid="document-empty"
    >
      <p className="text-sm text-destructive">
        This document has no content available.
      </p>
      <p className="text-xs text-muted-foreground">
        The file may have been removed from storage. Try re-uploading the document.
      </p>
    </div>
  );
}

interface BlobBodyProps {
  blob: DocumentBlob;
}

export function ImageBody({ blob }: BlobBodyProps) {
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

export function PdfBody({ blob }: BlobBodyProps) {
  return (
    <div className="h-full bg-white rounded-b-lg">
      <iframe src={blob.url} className="w-full h-full" title="Source document" />
    </div>
  );
}

export function GenericBlobBody({ blob }: BlobBodyProps) {
  return (
    <iframe
      src={blob.url}
      className="w-full h-full rounded-b-lg"
      title="Source document"
    />
  );
}
