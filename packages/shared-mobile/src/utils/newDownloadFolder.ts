import { Directory } from "expo-file-system";

let folderCount = 0;

/**
 * A fresh folder inside `parent` for one download, so two at once of the same file name never
 * share a copy, and the first one's cleanup can't remove the file the second is still showing.
 * Clearing `parent` at launch removes any a killed app left behind.
 */
export function newDownloadFolder(parent: Directory): Directory {
  folderCount += 1;
  const folder = new Directory(parent, String(folderCount));
  folder.create({ idempotent: true, intermediates: true });
  return folder;
}
