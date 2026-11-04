import { useEffect, useRef, useState } from "react";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import type { FileForUpload } from "../../types/FileForUpload";
import { releaseHeldFile } from "./heldFile";

export type HeldFilePick = () => Promise<FileForUpload | "denied" | null>;

/** The file a sheet is about to upload. It goes away when the sheet does. */
export function useHeldFile(showFailure: (message: string | null) => void) {
  const [file, setFile] = useState<FileForUpload | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const isMounted = useRef(true);
  const isPickingNow = useRef(false);
  const held = useRef<string | null>(null);

  function hold(next: FileForUpload | null): void {
    if (held.current) releaseHeldFile(held.current);
    held.current = next?.uri ?? null;
    setFile(next);
  }

  // Losing write access or leaving the page can take the sheet away with a file still held.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (held.current) releaseHeldFile(held.current);
      held.current = null;
    };
  }, []);

  async function pick(from: HeldFilePick): Promise<void> {
    if (isPickingNow.current) return;
    isPickingNow.current = true;
    showFailure(null);
    setIsPicking(true);
    try {
      const picked = await from();
      if (picked === "denied") {
        showFailure(UPLOAD_MESSAGES.cameraDenied);
      } else if (picked && !isMounted.current) {
        releaseHeldFile(picked.uri);
      } else if (picked) {
        hold(picked);
      }
    } catch {
      showFailure(UPLOAD_MESSAGES.pickFailed);
    } finally {
      isPickingNow.current = false;
      setIsPicking(false);
    }
  }

  return { file, isPicking, pick, forget: () => hold(null) };
}
