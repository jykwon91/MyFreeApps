import { useRef, useState } from "react";
import { showError, extractErrorMessage } from "@platform/ui";
import { documentDownloadUrl } from "@myjobhunter/api-client/utils/documentDownloadUrl";
import { DOCUMENT_DOWNLOAD_MESSAGES as MESSAGES } from "@/constants/document-download-messages";

export type FetchDownloadUrl = (id: string) => Promise<{ url: string }>;

export interface UseFileDownloadResult {
  /** Call from a click handler — must run inside the user gesture. */
  download: (id: string) => Promise<void>;
  /** The id being fetched right now, or null. */
  downloadingId: string | null;
}

/**
 * Opens a file's presigned download URL in a new tab, exactly once per call to `download`.
 * Documents and resume uploads share it; each passes the call that fetches its fresh URL.
 *
 * A blank tab is opened synchronously (while the click's user activation is
 * still live, so popup blockers allow it) and navigated to the URL once a
 * fresh one is fetched. The tab is closed again if the fetch fails or the
 * link isn't http(s). The opener link is severed so the file host can't
 * reach back into the app.
 */
export function useFileDownload(fetchUrl: FetchDownloadUrl): UseFileDownloadResult {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function download(id: string): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setDownloadingId(id);

    const win = window.open("", "_blank");
    if (win) win.opener = null;

    try {
      const url = documentDownloadUrl(await fetchUrl(id));
      if (!url) {
        win?.close();
        showError(MESSAGES.unsafeLink);
        return;
      }
      if (win) {
        win.location.href = url;
      } else {
        // Popup was blocked outright; navigating the current tab to a
        // download URL keeps the file reachable without a second open.
        window.location.assign(url);
      }
    } catch (err) {
      win?.close();
      showError(MESSAGES.failed(extractErrorMessage(err)));
    } finally {
      inFlight.current = false;
      setDownloadingId(null);
    }
  }

  return { download, downloadingId };
}
