import { useRef, useState } from "react";
import type { DocumentReaderMessages } from "../../types/DocumentReaderMessages";
import type { DocumentReaders } from "../../types/DocumentReaders";
import type { FileForUpload } from "../../types/FileForUpload";
import { type HeldFilePick, useHeldFile } from "../uploads/useHeldFile";
import { documentReadFailure } from "./documentReadFailure";

/**
 * Reads a document the moment it's picked, as the website does: picking is the whole
 * interaction. A file that fails to read stays held so Try again works without re-picking it.
 */
export function useReadDocument<TDraft>(
  readers: DocumentReaders<TDraft>,
  messages: DocumentReaderMessages,
  onRead: (draft: TDraft) => void,
) {
  const [failure, setFailure] = useState<string | null>(null);
  const [readName, setReadName] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const held = useHeldFile(setFailure);
  const isBusy = useRef(false);

  async function run(name: string, read: () => Promise<TDraft>, release: boolean): Promise<void> {
    if (isBusy.current) return;
    isBusy.current = true;
    setIsReading(true);
    setFailure(null);
    try {
      onRead(await read());
      setReadName(name);
      if (release) held.forget();
    } catch (error) {
      setFailure(documentReadFailure(error, messages));
    } finally {
      isBusy.current = false;
      setIsReading(false);
    }
  }

  function readFile(file: FileForUpload): Promise<void> {
    return run(file.name, () => readers.fromFile(file), true);
  }

  async function chooseAndRead(from: HeldFilePick): Promise<void> {
    const chosen: { file: FileForUpload | null } = { file: null };
    await held.pick(async () => {
      const result = await from();
      if (result && result !== "denied") chosen.file = result;
      return result;
    });
    if (chosen.file) await readFile(chosen.file);
  }

  return {
    file: held.file,
    isPicking: held.isPicking,
    isReading,
    failure,
    readName,
    chooseAndRead,
    retry: () => (held.file ? readFile(held.file) : Promise.resolve()),
    readLibrary: (documentId: string, name: string) => run(name, () => readers.fromLibrary(documentId), false),
    forget: () => {
      held.forget();
      setFailure(null);
    },
  };
}
