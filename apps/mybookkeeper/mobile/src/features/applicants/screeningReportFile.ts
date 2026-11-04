import { nanoid } from "@reduxjs/toolkit";
import { Directory, File, Paths } from "expo-file-system";
import { SCREENING_REPORT_DIRECTORY } from "../../constants/applicantScreening";

function reportDirectory(): Directory {
  return new Directory(Paths.cache, SCREENING_REPORT_DIRECTORY);
}

/**
 * Screening reports are about someone else, so they don't wait on the phone the way receipts do.
 * The one being uploaded sits here so that Try again works, and nowhere else.
 */
export function holdReport(sourceUri: string, name: string): string {
  const source = new File(sourceUri);
  try {
    const directory = reportDirectory();
    directory.create({ idempotent: true, intermediates: true });
    const held = new File(directory, `${nanoid(6)}-${name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`);
    source.move(held);
    return held.uri;
  } catch (error) {
    if (source.exists) source.delete();
    throw error;
  }
}

/** Never throws: a saved upload mustn't look failed. The next launch tries again, and the system clears this folder when it needs room. */
export function clearHeldReports(): void {
  try {
    const directory = reportDirectory();
    if (directory.exists) directory.delete();
  } catch (error) {
    console.warn("Couldn't clear held screening reports", error);
  }
}
