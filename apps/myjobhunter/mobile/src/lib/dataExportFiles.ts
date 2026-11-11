import { clearDownloadCopies } from "@platform/mobile";
import { Directory, Paths } from "expo-file-system";
import { DATA_EXPORT_DIRECTORY } from "../constants/dataExport";

export function dataExportFiles(): Directory {
  return new Directory(Paths.cache, DATA_EXPORT_DIRECTORY);
}

/** For a copy left behind when the app was killed while one was open: it's the whole account. */
export function clearDataExportFiles(): void {
  clearDownloadCopies(dataExportFiles());
}
