import { type HeldFilePick, useHeldFiles } from "./useHeldFiles";
import type { FileForUpload } from "@platform/mobile";

export type { HeldFilePick };

/** The one file a sheet is about to upload. It goes away when the sheet does. */
export function useHeldFile(showFailure: (message: string | null) => void): {
  file: FileForUpload | null;
  isPicking: boolean;
  pick: (from: HeldFilePick) => Promise<FileForUpload | null>;
  forget: () => void;
} {
  const { files, isPicking, pick, forgetAll } = useHeldFiles(showFailure, { replace: true });
  return { file: files[0] ?? null, isPicking, pick, forget: forgetAll };
}
