import { useDeleteSignedLeaseAttachmentMutation, useGetSignedLeaseByIdQuery, useUpdateLeaseAttachmentMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import { isLeaseAttachmentLockedFailure } from "@mybookkeeper/api-client/utils/isLeaseAttachmentLockedFailure";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { LEASE_FILE_MESSAGES } from "../../constants/leaseFiles";
import type { LeaseFileAction } from "../../types/LeaseFileAction";
import { changeFileTypeFailure, removeFileFailure } from "./leaseFileFailure";

/** Changes a file's type or removes it, one at a time. The failure is told in fixed words, never the server's. */
export function useLeaseFileActions(leaseId: string): {
  busy: { id: string; action: LeaseFileAction } | null;
  changeKind: (file: SignedLeaseAttachment, kind: LeaseAttachmentKind) => Promise<void>;
  remove: (file: SignedLeaseAttachment) => Promise<void>;
} {
  const { showToast } = useToast();
  const [updateFile] = useUpdateLeaseAttachmentMutation();
  const [deleteFile] = useDeleteSignedLeaseAttachmentMutation();
  const [busy, setBusy] = useState<{ id: string; action: LeaseFileAction } | null>(null);
  const { refetch } = useGetSignedLeaseByIdQuery(leaseId);
  const isSending = useRef(false);

  async function run(file: SignedLeaseAttachment, kind: LeaseFileAction, action: () => Promise<unknown>, success: string, failure: (error: unknown) => string): Promise<void> {
    if (isSending.current) return;
    isSending.current = true;
    setBusy({ id: file.id, action: kind });
    try {
      await action();
      showToast(success);
    } catch (error) {
      if (isLeaseAttachmentLockedFailure(error)) void refetch();
      showToast(failure(error), "error");
    } finally {
      isSending.current = false;
      setBusy(null);
    }
  }

  return {
    busy,
    changeKind: (file, kind) =>
      kind === file.kind ? Promise.resolve() : run(file, "change", () => updateFile({ leaseId, attachmentId: file.id, kind }).unwrap(), LEASE_FILE_MESSAGES.typeChanged, changeFileTypeFailure),
    remove: (file) => run(file, "remove", () => deleteFile({ leaseId, attachmentId: file.id }).unwrap(), LEASE_FILE_MESSAGES.removed, removeFileFailure),
  };
}
