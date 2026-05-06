import { useState } from "react";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";
import AttachmentViewer from "@/app/features/leases/AttachmentViewer";
import LeaseReceiptsRow from "./LeaseReceiptsRow";

export interface LinkedLeaseReceiptsProps {
  leases: readonly SignedLeaseSummary[];
}

/**
 * Receipts section on the tenant detail page. Aggregates
 * ``rent_receipt`` attachments across every lease linked to the tenant
 * so renewals don't fragment the receipt history. Lives in its own
 * section so receipts don't clutter the Leases group — the user
 * explicitly asked for this split on 2026-05-04.
 */
export default function LinkedLeaseReceipts({ leases }: LinkedLeaseReceiptsProps) {
  const [viewing, setViewing] = useState<SignedLeaseAttachment | null>(null);
  if (!leases.length) return null;
  return (
    <section
      className="border rounded-lg p-4 space-y-2"
      data-testid="linked-receipts-section"
    >
      <h2 className="text-sm font-medium">Receipts</h2>
      <ul className="space-y-1">
        {leases.map((lease) => (
          <LeaseReceiptsRow key={lease.id} leaseId={lease.id} onPreview={setViewing} />
        ))}
      </ul>
      {viewing ? (
        <AttachmentViewer
          url={viewing.presigned_url ?? ""}
          filename={viewing.filename}
          contentType={viewing.content_type}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </section>
  );
}
