import { useEffect, useRef, useState } from "react";
import type { FileForUpload } from "@platform/mobile";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
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
  const sending = useRef(0);

  function hold(next: FileForUpload[]): void {
    for (const old of held.current) {
      if (!next.some((file) => file.uri === old.uri)) releaseHeldFile(old.uri);
    }
    held.current = next;
    setFiles(next);
  }

  function releaseAll(): void {
    for (const file of held.current) releaseHeldFile(file.uri);
    held.current = [];
  }

  // Losing write access or leaving the page can take the sheet away with files still held. A request
  // still reading them finishes first: whileSending lets go of them once it settles.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (sending.current === 0) releaseAll();
    };
  }, []);

  /** Runs a request that reads the held files, and keeps them on disk until it settles even if the sheet goes. */
  async function whileSending<T>(send: () => Promise<T>): Promise<T> {
    sending.current += 1;
    try {
      return await send();
    } finally {
      sending.current -= 1;
      if (sending.current === 0 && !isMounted.current) releaseAll();
    }
  }

  /** Holds a file that was made elsewhere. Lets go of it if the sheet has gone. */
  function add(file: FileForUpload): void {
    if (!isMounted.current) releaseHeldFile(file.uri);
    else hold(replace ? [file] : [...held.current, file]);
  }

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
      } else if (picked) {
        add(picked);
        return isMounted.current ? picked : null;
      }
    } catch {
      showFailure(UPLOAD_MESSAGES.pickFailed);
    } finally {
      isPickingNow.current = false;
      setIsPicking(false);
    }
    return null;
  }

  return { files, isPicking, pick, add, whileSending, drop: (uri: string) => hold(held.current.filter((file) => file.uri !== uri)), forgetAll: () => hold([]) };
}
