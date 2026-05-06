import { useState } from "react";
import { useGetSignedLeaseByIdQuery } from "@/shared/store/signedLeasesApi";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";
import SignedLeaseStatusBadge from "@/app/features/leases/SignedLeaseStatusBadge";
import AttachmentViewer from "@/app/features/leases/AttachmentViewer";
import { formatLongDate } from "@/shared/lib/inquiry-date-format";
import LinkedLeaseDocumentsBody from "./LinkedLeaseDocumentsBody";
import { useLinkedLeaseDocumentsMode } from "./useLinkedLeaseDocumentsMode";

export interface LinkedLeaseDocumentsProps {
  lease: SignedLeaseSummary;
}

const RECEIPT_KIND = "rent_receipt";

/**
 * Lists a single linked lease's NON-RECEIPT attachments inline on the
 * applicant/tenant detail page. Receipts render in a separate section
 * via ``LinkedLeaseReceipts``. Click a filename to open the document
 * via ``AttachmentViewer``.
 *
 * Missing-storage rows (``is_available=false``) are captured to
 * PostHog + Sentry observability — there's no user-facing UI for the
 * broken state. The host-side recovery path is the existing
 * delete + upload flow on the lease detail page.
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

  const mode = useLinkedLeaseDocumentsMode({ isLoading, attachments });

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

      <LinkedLeaseDocumentsBody
        mode={mode}
        attachments={attachments}
        onPreview={setViewing}
      />

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
