import { Download, FileText } from "lucide-react";
import { useGetSignedLeaseByIdQuery } from "@/shared/store/signedLeasesApi";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";

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
 */
export default function LeaseReceiptsRow({ leaseId, onPreview }: LeaseReceiptsRowProps) {
  const { data: detail, isLoading } = useGetSignedLeaseByIdQuery(leaseId);
  const receipts = (detail?.attachments ?? []).filter((a) => a.kind === RECEIPT_KIND);

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
            {att.presigned_url ? (
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
