import { Link } from "react-router-dom";
import { AlertTriangle, Download, FileText } from "lucide-react";
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
 *
 * Receipts are system-generated (sequential receipt number, PDF rendered
 * server-side from rent transactions); a missing storage object can't be
 * fixed by re-uploading an arbitrary file. The row stays clickable —
 * the missing-file filename links to the receipts page where the user
 * can re-generate it.
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
      {receipts.map((att) => {
        const isMissing = att.is_available === false;
        return (
          <li
            key={att.id}
            className="border rounded-md px-3 py-2 text-sm space-y-1"
            data-testid={`receipt-attachment-${att.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText
                  className={`h-4 w-4 shrink-0 ${
                    isMissing ? "text-destructive" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                {isMissing ? (
                  <Link
                    to="/receipts"
                    className="text-left text-destructive hover:underline font-medium truncate"
                    data-testid={`receipt-attachment-regen-link-${att.id}`}
                    title={`${att.filename} — re-generate from receipts page`}
                  >
                    {att.filename}
                  </Link>
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
            </div>
            {isMissing ? (
              <div
                className="flex items-center gap-2 text-xs text-destructive"
                role="alert"
                data-testid={`receipt-attachment-${att.id}-missing`}
              >
                <AlertTriangle size={14} aria-hidden="true" />
                <span>Receipt PDF missing — re-generate from the receipts page.</span>
              </div>
            ) : null}
          </li>
        );
      })}
    </>
  );
}
