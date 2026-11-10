import { useImportBankCsvMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import type { ImportResult } from "@mybookkeeper/api-client/types/transaction/ImportResult";
import { bankImportFailure } from "@mybookkeeper/api-client/utils/bankImportFailure";
import { useRef, useState } from "react";
import { filePart } from "../../lib/filePart";
import type { FileForUpload } from "../../types/FileForUpload";

/** Sends the statement once, however many times the button is tapped, and keeps the answer. */
export function useImportBankCsv() {
  const [importBankCsv] = useImportBankCsvMutation();
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const isSending = useRef(false);

  async function submit(file: FileForUpload, propertyId: string | null): Promise<void> {
    if (isSending.current) return;
    isSending.current = true;
    setIsBusy(true);
    setFailure(null);
    const form = new FormData();
    form.append("file", filePart(file));
    try {
      const imported = await importBankCsv({ form, propertyId: propertyId ?? undefined }).unwrap();
      setResult(imported);
    } catch (error) {
      setFailure(bankImportFailure(error));
    } finally {
      isSending.current = false;
      setIsBusy(false);
    }
  }

  return { submit, isBusy, failure, result, reset: () => setResult(null), clearFailure: () => setFailure(null) };
}
