import { File } from "expo-file-system";
import { useRef } from "react";
import { bearerHeader } from "../auth/bearerHeader";
import { DATA_EXPORT_PATH, DATA_EXPORT_SHARE } from "../constants/dataExport";
import { SECURITY_MESSAGES as MESSAGES } from "../constants/security";
import type { DataExportSource } from "../types/DataExportSource";
import { dataExportFileName } from "../utils/dataExportFileName";
import { dataExportFiles } from "../utils/dataExportFiles";
import { shareDownloadedFile } from "../utils/shareDownloadedFile";
import { useToast } from "./useToast";

/**
 * Downloads the account's JSON export and opens the share sheet on it, as the website downloads it.
 * The download skips the API client, so its sign-in may have expired: `renewSession` makes a
 * request that renews it first.
 */
export function useDataExport(
  { apiBaseUrl, session, filePrefix }: DataExportSource,
  renewSession: () => Promise<unknown>,
): () => Promise<void> {
  const { showToast } = useToast();
  const isExporting = useRef(false);

  return async function exportData(): Promise<void> {
    if (isExporting.current) return;
    isExporting.current = true;
    try {
      await renewSession();
      const directory = dataExportFiles();
      directory.create({ idempotent: true, intermediates: true });
      const destination = new File(directory, dataExportFileName(filePrefix, new Date()));
      await shareDownloadedFile(`${apiBaseUrl}${DATA_EXPORT_PATH}`, destination, {
        headers: bearerHeader(session),
        share: DATA_EXPORT_SHARE,
      });
      // After the sheet closes: expo-sharing can't tell a share from a cancel, so this reports the download.
      showToast(MESSAGES.exported, "success");
    } catch {
      showToast(MESSAGES.exportFailed, "error");
    } finally {
      isExporting.current = false;
    }
  };
}
