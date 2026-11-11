import { clearDownloadCopies } from "@platform/mobile";
import { Directory, Paths } from "expo-file-system";
import { RESUME_EXPORT_DIRECTORY } from "../constants/resumeStorage";

/** The cache folder downloaded resumes pass through on their way to the share sheet. */
export function resumeExportFiles(): Directory {
  return new Directory(Paths.cache, RESUME_EXPORT_DIRECTORY);
}

/** For a copy left behind when the app was killed while one was open, or by an account that signed out. */
export function clearResumeExportFiles(): void {
  clearDownloadCopies(resumeExportFiles());
}
