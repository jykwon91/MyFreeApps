import * as Clipboard from "expo-clipboard";

/** False when the phone wouldn't take it, so the caller can say so instead of claiming a copy. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
