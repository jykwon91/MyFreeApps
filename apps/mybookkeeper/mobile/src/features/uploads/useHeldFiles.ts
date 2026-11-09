import { useEffect, useRef, useState } from "react";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import type { FileForUpload } from "../../types/FileForUpload";
import { releaseHeldFile } from "./heldFile";

export type HeldFilePick = () => Promise<FileForUpload | "denied" | null>;

interface HeldFilesOptions {
  /** One file at a time: a new pick takes the place of the one held. */
  replace?: boolean;
}

/** The files a sheet is about to upload. They go away when the sheet does. */
export function useHeldFiles(showFailure: (message: string | null) => void, { replace = false }: HeldFilesOptions = {}) {
  const [files, setFiles] = useState<FileForUpload[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const isMounted = useRef(true);
  const isPickingNow = useRef(false);
  const held = useRef<FileForUpload[]>([]);

  function hold(next: FileForUpload[]): void {
    for (const old of held.current) {
      if (!next.some((file) => file.uri === old.uri)) releaseHeldFile(old.uri);
    }
    held.current = next;
    setFiles(next);
  }

  // Losing write access or leaving the page can take the sheet away with files still held.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      for (const file of held.current) releaseHeldFile(file.uri);
      held.current = [];
    };
  }, []);

  /** Resolves with the file now held, or null when nothing was picked. */
  async function pick(from: HeldFilePick): Promise<FileForUpload | null> {
    if (isPickingNow.current) return null;
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
        hold(replace ? [picked] : [...held.current, picked]);
        return picked;
      }
    } catch {
      showFailure(UPLOAD_MESSAGES.pickFailed);
    } finally {
      isPickingNow.current = false;
      setIsPicking(false);
    }
    return null;
  }

  return { files, isPicking, pick, drop: (uri: string) => hold(held.current.filter((file) => file.uri !== uri)), forgetAll: () => hold([]) };
}
