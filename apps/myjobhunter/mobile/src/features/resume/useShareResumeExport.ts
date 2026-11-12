import { RESUME_EXPORT_MIME_TYPES } from "@myjobhunter/api-client/constants/resumeExportMimeTypes";
import type { ExportFormat } from "@myjobhunter/api-client/types/resume-refinement/export-format";
import { resumeExportFileName } from "@myjobhunter/api-client/utils/resumeExportFileName";
import { resumeExportPath } from "@myjobhunter/api-client/utils/resumeExportPath";
import { clearDownloadCopies, newDownloadFolder, shareDownloadedFile, useToast } from "@platform/mobile";
import { File } from "expo-file-system";
import { useRef, useState } from "react";
import { API_BASE_URL } from "../../constants/api";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { RESUME_EXPORT_UTIS } from "../../constants/resumeExportUtis";
import { refinementFailure } from "../../lib/refinementFailure";
import { resumeExportFiles } from "../../lib/resumeExportFiles";
import { session } from "../../lib/session";
import type { ResumeExportShare } from "../../types/ResumeExportShare";

/**
 * The website saves the file; the phone opens the share sheet on it, where it can be saved to
 * Files, sent or previewed. The download skips the API client, so its sign-in may have expired:
 * `renewSession` makes a request that renews it first. Held by the session view, above the
 * Review / Draft switch, so switching panes mid-download can't let a second one start.
 */
export function useShareResumeExport(sessionId: string, renewSession: () => Promise<unknown>): ResumeExportShare {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const isBusy = useRef(false);

  async function download(format: ExportFormat): Promise<void> {
    if (isBusy.current) return;
    isBusy.current = true;
    setDownloading(format);
    // Its own folder, so the share sheet shows the plain file name and no other download shares the copy.
    const folder = newDownloadFolder(resumeExportFiles());
    try {
      await renewSession();
      await shareDownloadedFile(`${API_BASE_URL}${resumeExportPath(sessionId, format)}`, new File(folder, resumeExportFileName(format)), {
        headers: { Authorization: `Bearer ${session.tokenStore.get() ?? ""}` },
        share: { mimeType: RESUME_EXPORT_MIME_TYPES[format], UTI: RESUME_EXPORT_UTIS[format] },
      });
    } catch (error) {
      showToast(refinementFailure(error, MESSAGES.couldntDownload), "error");
    } finally {
      clearDownloadCopies(folder);
      isBusy.current = false;
      setDownloading(null);
    }
  }

  return { downloading, download };
}
