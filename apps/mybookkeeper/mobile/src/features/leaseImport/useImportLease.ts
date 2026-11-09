import { useImportSignedLeaseMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { LeaseImportFormValues } from "@mybookkeeper/api-client/types/lease/lease-import-form-values";
import { leaseImportFields } from "@mybookkeeper/api-client/utils/leaseImportForm";
import { useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { leaseImported } from "../../constants/leaseImport";
import { filePart } from "../../lib/filePart";
import type { FileForUpload } from "../../types/FileForUpload";
import { leaseImportFailure } from "./leaseImportFailure";

/** Sends the form and its files, then opens the lease it made. */
export function useImportLease() {
  const { showToast } = useToast();
  const [importLease] = useImportSignedLeaseMutation();
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const isSending = useRef(false);

  // It waits a render, or the discard question still sees the unsaved form.
  useEffect(() => {
    if (openedId) router.replace(`/leases/${openedId}`);
  }, [openedId]);

  async function submit(values: LeaseImportFormValues, files: readonly FileForUpload[]): Promise<void> {
    if (isSending.current) return;
    isSending.current = true;
    setIsBusy(true);
    setFailure(null);
    const form = new FormData();
    for (const [name, value] of Object.entries(leaseImportFields(values))) form.append(name, value);
    for (const file of files) form.append("files", filePart(file));
    try {
      const lease = await importLease(form).unwrap();
      showToast(leaseImported(lease.attachments.length));
      // Stays locked: the screen is going, and a tap while it slides off would import again.
      setOpenedId(lease.id);
    } catch (error) {
      isSending.current = false;
      setFailure(leaseImportFailure(error));
    } finally {
      setIsBusy(false);
    }
  }

  return { submit, isBusy, isLeaving: openedId !== null, failure };
}
