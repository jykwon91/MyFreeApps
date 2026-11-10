import { nanoid } from "@reduxjs/toolkit";
import { Directory, File, Paths } from "expo-file-system";
import { HELD_UPLOAD_DIRECTORY } from "../../constants/uploads";

function heldDirectory(): Directory {
  return new Directory(Paths.cache, HELD_UPLOAD_DIRECTORY);
}

/**
 * Screening reports and leases are about someone else, so they don't wait on the phone the way
 * receipts do. The one being uploaded sits here so that Try again works, and nowhere else.
 */
export function holdFile(sourceUri: string, name: string): string {
  const source = new File(sourceUri);
  try {
    const directory = heldDirectory();
    directory.create({ idempotent: true, intermediates: true });
    const held = new File(directory, `${nanoid(6)}-${name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`);
    source.move(held);
    return held.uri;
  } catch (error) {
    if (source.exists) source.delete();
    throw error;
  }
}

export function heldFileSize(uri: string): number {
  return new File(uri).size;
}

/** Never throws: a saved upload mustn't look failed. The next launch tries again, and the system clears this folder when it needs room. */
export function releaseHeldFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn("Couldn't remove a held upload", error);
  }
}

/** For launch and sign-out. A sheet lets go of its own file with releaseHeldFile. */
export function clearHeldFiles(): void {
  try {
    const directory = heldDirectory();
    if (directory.exists) directory.delete();
  } catch (error) {
    console.warn("Couldn't clear held uploads", error);
  }
}
