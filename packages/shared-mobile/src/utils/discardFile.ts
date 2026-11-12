import { File } from "expo-file-system";

/** Deletes a file the app made or was handed, such as a picker's copy of a photo, if it's still there. */
export function discardFile(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}
