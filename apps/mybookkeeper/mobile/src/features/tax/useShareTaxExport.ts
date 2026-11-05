import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { API_BASE_URL } from "../../constants/api";
import { TAX_REPORT_MESSAGES as MESSAGES } from "../../constants/taxReport";
import type { TaxExport } from "../../types/TaxExport";
import { shareExportFile } from "../documents/openDocumentFile";
import { useFileRequestHeaders } from "../documents/useFileRequestHeaders";
import { isExportLimitError } from "./taxReportDisplay";

/**
 * The download skips the API client, so its sign-in may have expired: `renewSession`
 * makes a request that renews it first.
 */
export function useShareTaxExport(renewSession: () => Promise<unknown>): { sharingId: string | null; share: (taxExport: TaxExport) => Promise<void> } {
  const { showToast } = useToast();
  const headers = useFileRequestHeaders();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const isSharing = useRef(false);

  async function share(taxExport: TaxExport): Promise<void> {
    if (isSharing.current) return;
    isSharing.current = true;
    setSharingId(taxExport.id);
    try {
      await renewSession();
      await shareExportFile(`${API_BASE_URL}${taxExport.path}`, taxExport.fileName, headers());
    } catch (error) {
      showToast(isExportLimitError(error) ? MESSAGES.tooManyExports : MESSAGES.couldntExport, "error");
    } finally {
      isSharing.current = false;
      setSharingId(null);
    }
  }

  return { sharingId, share };
}
