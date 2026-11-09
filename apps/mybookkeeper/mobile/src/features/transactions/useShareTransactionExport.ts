import type { TransactionExportFormat } from "@mybookkeeper/api-client/types/transaction/TransactionExportFormat";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import { transactionExportPath } from "@mybookkeeper/api-client/utils/transactionExportPath";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { API_BASE_URL } from "../../constants/api";
import { shareExportFile } from "../documents/openDocumentFile";
import { useFileRequestHeaders } from "../documents/useFileRequestHeaders";
import { exportFailureMessage, exportFileName } from "./transactionExport";

/**
 * Downloads the transactions the filters show and opens the share sheet. The download skips the
 * API client, so its sign-in may have expired: `renewSession` makes a request that renews it first.
 */
export function useShareTransactionExport(renewSession: () => Promise<unknown>) {
  const { showToast } = useToast();
  const headers = useFileRequestHeaders();
  const [isExporting, setIsExporting] = useState(false);
  const inFlight = useRef(false);

  async function exportTransactions(format: TransactionExportFormat, filters: TransactionListParams): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsExporting(true);
    try {
      await renewSession();
      await shareExportFile(`${API_BASE_URL}${transactionExportPath(format, filters)}`, exportFileName(format), headers());
    } catch (error) {
      showToast(exportFailureMessage(format, error), "error");
    } finally {
      inFlight.current = false;
      setIsExporting(false);
    }
  }

  return { isExporting, exportTransactions };
}
