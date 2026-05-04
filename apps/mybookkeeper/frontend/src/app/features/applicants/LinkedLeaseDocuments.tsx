import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { useGetSignedLeaseByIdQuery } from "@/shared/store/signedLeasesApi";
import { LEASE_ATTACHMENT_KIND_LABELS } from "@/shared/lib/lease-labels";
import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";
import SignedLeaseStatusBadge from "@/app/features/leases/SignedLeaseStatusBadge";
import AttachmentViewer from "@/app/features/leases/AttachmentViewer";
import { formatLongDate } from "@/shared/lib/inquiry-date-format";

export interface LinkedLeaseDocumentsProps {
  lease: SignedLeaseSummary;
}

const RECEIPT_KIND = "rent_receipt";

/**
 * Lists a single linked lease's NON-RECEIPT attachments inline on the
 * applicant/tenant detail page. Receipts render in a separate section
 * via ``LinkedLeaseReceipts`` so the Leases group only shows the lease
 * agreement + addenda + amendments. Click a filename to open the
 * document via ``AttachmentViewer``.
 */
export default function LinkedLeaseDocuments({ lease }: LinkedLeaseDocumentsProps) {
  const { data: detail, isLoading } = useGetSignedLeaseByIdQuery(lease.id);
  const [viewing, setViewing] = useState<SignedLeaseAttachment | null>(null);

  const dates =
    lease.starts_on || lease.ends_on
      ? `${lease.starts_on ? formatLongDate(lease.starts_on) : "—"} → ${
          lease.ends_on ? formatLongDate(lease.ends_on) : "—"
        }`
      : null;
  const attachments = (detail?.attachments ?? []).filter(
    (att) => att.kind !== RECEIPT_KIND,
  );

  return (
    <div className="space-y-2" data-testid={`linked-lease-${lease.id}`}>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="font-medium">
          {lease.kind === "imported" ? "Imported lease" : "Generated lease"}
        </span>
        <SignedLeaseStatusBadge status={lease.status} />
        {dates ? (
          <span className="text-xs text-muted-foreground">{dates}</span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground" data-testid="linked-lease-loading">
          Pulling documents...
        </p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents on this lease yet.</p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((att) => {
            const canPreview =
              att.presigned_url !== null &&
              (att.content_type === "application/pdf" ||
                att.content_type.startsWith("image/"));
            const kindLabel =
              LEASE_ATTACHMENT_KIND_LABELS[att.kind as LeaseAttachmentKind] ?? att.kind;
            return (
              <li
                key={att.id}
                className="border rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2"
                data-testid={`linked-lease-attachment-${att.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  {canPreview ? (
                    <button
                      type="button"
                      onClick={() => setViewing(att)}
                      className="text-left text-primary hover:underline font-medium truncate"
                      data-testid={`linked-lease-attachment-preview-${att.id}`}
                      title={att.filename}
                    >
                      {att.filename}
                    </button>
                  ) : (
                    <span className="truncate text-muted-foreground" title={att.filename}>
                      {att.filename}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">{kindLabel}</span>
                </div>
                {att.presigned_url ? (
                  <a
                    href={att.presigned_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={`Download ${att.filename}`}
                    data-testid={`linked-lease-attachment-download-${att.id}`}
                  >
                    <Download size={14} />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {viewing?.presigned_url ? (
        <AttachmentViewer
          url={viewing.presigned_url}
          filename={viewing.filename}
          contentType={viewing.content_type}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
