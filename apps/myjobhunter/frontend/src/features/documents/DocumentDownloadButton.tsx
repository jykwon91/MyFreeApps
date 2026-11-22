import { Download, Loader2 } from "lucide-react";
import { useLazyGetDocumentDownloadUrlQuery } from "@myjobhunter/api-client/store/documentsApi";
import { useFileDownload } from "@/hooks/useFileDownload";

interface DocumentDownloadButtonProps {
  documentId: string;
}

export default function DocumentDownloadButton({ documentId }: DocumentDownloadButtonProps) {
  const [fetchUrl] = useLazyGetDocumentDownloadUrlQuery();
  const { download, downloadingId } = useFileDownload((id) => fetchUrl(id).unwrap());
  const isDownloading = downloadingId !== null;

  return (
    <button
      type="button"
      onClick={() => void download(documentId)}
      disabled={isDownloading}
      aria-busy={isDownloading}
      title="Download file"
      aria-label="Download file"
      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
    </button>
  );
}
