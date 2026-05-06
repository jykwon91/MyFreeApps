import { useNavigate } from "react-router-dom";
import { Download, FileText } from "lucide-react";
import { useGetSignedLeaseByIdQuery } from "@/shared/store/signedLeasesApi";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import { reportMissingStorageObject } from "@/shared/lib/storage-observability";

export interface LeaseReceiptsRowProps {
  leaseId: string;
  onPreview: (attachment: SignedLeaseAttachment) => void;
}

const RECEIPT_KIND = "rent_receipt";

/**
 * Fetches a single lease's attachments and renders only the
 * ``rent_receipt`` ones as inline list items. Used by
 * ``LinkedLeaseReceipts`` once per linked lease so receipts from a
 * renewed lease appear alongside originals.
 *
 * Receipts are system-generated (sequential receipt number, PDF rendered
 * server-side from rent transactions); a missing storage object can't be
 * fixed by re-uploading an arbitrary file. When a row's underlying
 * object is missing we silently capture an observability event and
 * route the click to ``/receipts`` for re-generation — the user-facing
 * UI never carries a destructive "missing" alert.
 */
export default function LeaseReceiptsRow({ leaseId, onPreview }: LeaseReceiptsRowProps) {
  const { data: detail, isLoading } = useGetSignedLeaseByIdQuery(leaseId);
  const receipts = (detail?.attachments ?? []).filter((a) => a.kind === RECEIPT_KIND);
  const navigate = useNavigate();

  if (isLoading) {
    return <li className="text-xs text-muted-foreground">Loading receipts…</li>;
  }
  if (!receipts.length) return null;

  return (
    <>
      {receipts.map((att) => {
        const isMissing = att.is_available === false;

        function handleMissingClick() {
          reportMissingStorageObject({
            domain: "lease_receipt",
            attachment_id: att.id,
            storage_key: att.storage_key,
            parent_id: leaseId,
            parent_kind: "signed_lease",
          });
          navigate("/receipts");
        }

        return (
          <li
            key={att.id}
            className="border rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2"
            data-testid={`receipt-attachment-${att.id}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              {isMissing ? (
                <button
                  type="button"
                  onClick={handleMissingClick}
                  className="text-left text-primary hover:underline font-medium truncate"
                  title={att.filename}
                >
                  {att.filename}
                </button>
              ) : att.presigned_url ? (
                <button
                  type="button"
                  onClick={() => onPreview(att)}
                  className="text-left text-primary hover:underline font-medium truncate"
                  title={att.filename}
                >
                  {att.filename}
                </button>
              ) : (
                <span className="truncate text-muted-foreground" title={att.filename}>
                  {att.filename}
                </span>
              )}
            </div>
            {!isMissing && att.presigned_url ? (
              <a
                href={att.presigned_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label={`Download ${att.filename}`}
              >
                <Download size={14} />
              </a>
            ) : null}
          </li>
        );
      })}
    </>
  );
}
