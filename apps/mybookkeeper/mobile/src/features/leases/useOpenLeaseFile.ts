import { useLazyGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { LEASE_MESSAGES } from "../../constants/leases";
import { openAttachmentFile } from "../documents/openDocumentFile";

export function useOpenLeaseFile(leaseId: string): {
  openingId: string | null;
  open: (file: SignedLeaseAttachment) => Promise<void>;
} {
  const { showToast } = useToast();
  const [fetchLease] = useLazyGetSignedLeaseByIdQuery();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const isOpening = useRef(false);

  /** Asks for the file's link again: it expires, and this page may have been open for a while. */
  async function open(file: SignedLeaseAttachment): Promise<void> {
    if (isOpening.current) return;
    isOpening.current = true;
    setOpeningId(file.id);
    try {
      const fresh = await fetchLease(leaseId).unwrap();
      const url = fresh.attachments.find((attachment) => attachment.id === file.id)?.presigned_url;
      if (!url) throw new Error("This file has no link");
      await openAttachmentFile(url, file);
    } catch {
      showToast(LEASE_MESSAGES.couldntOpen, "error");
    } finally {
      isOpening.current = false;
      setOpeningId(null);
    }
  }

  return { openingId, open };
}
