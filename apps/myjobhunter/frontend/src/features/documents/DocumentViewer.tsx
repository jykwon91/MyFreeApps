import { Download } from "lucide-react";
import { Skeleton } from "@platform/ui";
import { useGetDocumentDownloadUrlQuery } from "@/lib/documentsApi";
import type { Document } from "@/types/document/document";
import { useDocumentViewMode } from "@/features/documents/useDocumentViewMode";

export interface DocumentViewerProps {
  document: Document;
}

function DocumentViewerBody({
  mode,
  doc,
  downloadUrl,
}: {
  mode: ReturnType<typeof useDocumentViewMode>;
  doc: Document;
  downloadUrl: string | null | undefined;
}) {
  switch (mode) {
    case "loading":
      return <Skeleton className="h-64 w-full rounded-lg" />;

    case "error":
      return (
        <div className="flex items-center justify-center h-32 text-sm text-destructive border rounded-lg">
          Couldn't load the file. Please try again.
        </div>
      );

    case "text-body":
      return doc.body ? (
        <pre className="text-sm whitespace-pre-wrap font-sans border rounded-lg p-4 bg-muted/30 overflow-auto max-h-[60vh]">
          {doc.body}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground italic">No content yet.</p>
      );

    case "pdf":
      return (
        <iframe
          src={downloadUrl ?? ""}
          title={doc.title}
          className="w-full border rounded-lg"
          style={{ height: "60vh" }}
        />
      );

    case "download-only":
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-10 border rounded-lg">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{doc.filename}</span> cannot be previewed inline.
          </p>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm border rounded-md hover:bg-muted"
            >
              <Download size={14} />
              Download file
            </a>
          ) : null}
        </div>
      );

    default:
      return null;
  }
}

export default function DocumentViewer({ document }: DocumentViewerProps) {
  const {
    data: downloadData,
    isLoading: downloadLoading,
    isError: downloadError,
  } = useGetDocumentDownloadUrlQuery(document.id, {
    skip: !document.has_file,
  });

  const mode = useDocumentViewMode({
    doc: document,
    downloadUrl: downloadData?.url,
    downloadError,
    downloadLoading,
  });

  return (
    <DocumentViewerBody
      mode={mode}
      doc={document}
      downloadUrl={downloadData?.url}
    />
  );
}
