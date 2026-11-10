import { useRef, useState } from "react";
import { showError, extractErrorMessage } from "@platform/ui";
import { useLazyGetDocumentDownloadUrlQuery } from "@myjobhunter/api-client/store/documentsApi";

export interface UseDocumentDownloadResult {
  /** Call from a click handler — must run inside the user gesture. */
  download: () => Promise<void>;
  isDownloading: boolean;
}

/**
 * Opens a document's presigned download URL in a new tab, exactly once per
 * call to `download`.
 *
 * A blank tab is opened synchronously (while the click's user activation is
 * still live, so popup blockers allow it) and navigated to the URL once a
 * fresh one is fetched. The tab is closed again if the fetch fails. The
 * opener link is severed so the file host can't reach back into the app.
 */
export function useDocumentDownload(documentId: string): UseDocumentDownloadResult {
  const [fetchUrl] = useLazyGetDocumentDownloadUrlQuery();
  const [isDownloading, setIsDownloading] = useState(false);
  const inFlight = useRef(false);

  async function download(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsDownloading(true);

    const win = window.open("", "_blank");
    if (win) win.opener = null;

    try {
      const { url } = await fetchUrl(documentId).unwrap();
      if (win) {
        win.location.href = url;
      } else {
        // Popup was blocked outright; navigating the current tab to a
        // download URL keeps the file reachable without a second open.
        window.location.assign(url);
      }
    } catch (err) {
      win?.close();
      showError(`Couldn't download the file: ${extractErrorMessage(err)}`);
    } finally {
      inFlight.current = false;
      setIsDownloading(false);
    }
  }

  return { download, isDownloading };
}
