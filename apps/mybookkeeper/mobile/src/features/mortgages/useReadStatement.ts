import {
  useExtractMortgageFromUploadMutation,
  useExtractMortgageMutation,
} from "@mybookkeeper/api-client/store/mortgagesApi";
import type { MortgageDraft } from "@mybookkeeper/api-client/types/mortgage/mortgage-draft";
import { useRef, useState } from "react";
import { filePart } from "../../lib/filePart";
import type { FileForUpload } from "../../types/FileForUpload";
import { type HeldFilePick, useHeldFile } from "../uploads/useHeldFile";
import { statementReadFailure } from "./statementReadFailure";

/**
 * Reads a statement the moment it's picked, as the website does: picking is the whole
 * interaction. A file that fails to read stays held so Try again works without re-picking it.
 */
export function useReadStatement(onRead: (draft: MortgageDraft) => void) {
  const [extractUpload, { isLoading: isReadingFile }] = useExtractMortgageFromUploadMutation();
  const [extractLibrary, { isLoading: isReadingLibrary }] = useExtractMortgageMutation();
  const [failure, setFailure] = useState<string | null>(null);
  const [readName, setReadName] = useState<string | null>(null);
  const held = useHeldFile(setFailure);
  const isReading = useRef(false);

  async function run(name: string, read: () => Promise<MortgageDraft>, release: boolean): Promise<void> {
    if (isReading.current) return;
    isReading.current = true;
    setFailure(null);
    try {
      onRead(await read());
      setReadName(name);
      if (release) held.forget();
    } catch (error) {
      setFailure(statementReadFailure(error));
    } finally {
      isReading.current = false;
    }
  }

  function readFile(file: FileForUpload): Promise<void> {
    return run(
      file.name,
      () => {
        const form = new FormData();
        form.append("file", filePart(file));
        return extractUpload(form).unwrap();
      },
      true,
    );
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
    isReading: isReadingFile || isReadingLibrary,
    failure,
    readName,
    chooseAndRead,
    retry: () => (held.file ? readFile(held.file) : Promise.resolve()),
    readLibrary: (documentId: string, name: string) => run(name, () => extractLibrary({ document_id: documentId }).unwrap(), false),
    forget: () => {
      held.forget();
      setFailure(null);
    },
  };
}
