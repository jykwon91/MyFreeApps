import { useEffect } from "react";
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
 * ``rent_receipt`` ones as inline list items.
 *
 * Click on filename = view receipt. Missing rows are captured to
 * PostHog + Sentry on render; the click attempts the (possibly empty)
 * presigned URL like any other row. Recovery is the operator's
 * responsibility via the receipts page — not the click target.
 */
export default function LeaseReceiptsRow({ leaseId, onPreview }: LeaseReceiptsRowProps) {
  const { data: detail, isLoading } = useGetSignedLeaseByIdQuery(leaseId);
  const receipts = (detail?.attachments ?? []).filter((a) => a.kind === RECEIPT_KIND);

  useEffect(() => {
    for (const att of receipts) {
      if (att.is_available === false) {
        reportMissingStorageObject({
          domain: "lease_receipt",
          attachment_id: att.id,
          storage_key: att.storage_key,
          parent_id: leaseId,
          parent_kind: "signed_lease",
        });
      }
    }
  }, [receipts, leaseId]);

  if (isLoading) {
    return <li className="text-xs text-muted-foreground">Loading receipts…</li>;
  }
  if (!receipts.length) return null;

  return (
    <>
      {receipts.map((att) => (
        <li
          key={att.id}
          className="border rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2"
          data-testid={`receipt-attachment-${att.id}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onPreview(att)}
              className="text-left text-primary hover:underline font-medium truncate"
              title={att.filename}
            >
              {att.filename}
            </button>
          </div>
          {att.presigned_url ? (
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
      ))}
    </>
  );
}
