import { Download, Loader2 } from "lucide-react";
import { useDocumentDownload } from "@/features/documents/useDocumentDownload";

interface DocumentDownloadButtonProps {
  documentId: string;
}

export default function DocumentDownloadButton({ documentId }: DocumentDownloadButtonProps) {
  const { download, isDownloading } = useDocumentDownload(documentId);

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={isDownloading}
      aria-busy={isDownloading}
      title="Download file"
      aria-label="Download file"
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
    </button>
  );
}
