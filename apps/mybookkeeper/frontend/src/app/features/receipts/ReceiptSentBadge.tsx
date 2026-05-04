/**
 * Small pill shown on a transaction row when a receipt has been sent.
 * Links to the signed-lease attachments page for the tenant's lease.
 */
interface Props {
  /** If provided, the badge links to the lease detail page. */
  leaseId?: string | null;
}

export default function ReceiptSentBadge({ leaseId }: Props) {
  const content = (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
      Receipt sent
    </span>
  );

  if (leaseId) {
    return (
      <a
        href={`/leases/${leaseId}`}
        data-testid="receipt-sent-badge"
        className="no-underline hover:opacity-80 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </a>
    );
  }

  return <span data-testid="receipt-sent-badge">{content}</span>;
}
