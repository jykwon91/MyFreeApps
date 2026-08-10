import { Link } from "react-router-dom";

export interface CalendarLeaseEventFooterProps {
  leaseId: string;
}

/**
 * Footer for a tenant-occupancy event in the calendar detail dialog.
 *
 * Lease events are read-only here: the notes and attachment endpoints are
 * keyed by blackout id, and this event's id is a lease id. Rather than
 * offering an edit that would 404, send the host to the lease — where notes,
 * documents, and the term itself actually live.
 */
export default function CalendarLeaseEventFooter({
  leaseId,
}: CalendarLeaseEventFooterProps) {
  return (
    <div className="border-t pt-3 space-y-2" data-testid="calendar-lease-footer">
      <p className="text-xs text-muted-foreground italic">
        These dates come from a signed lease, so they aren't editable here.
      </p>
      <Link
        to={`/leases/${leaseId}`}
        className="inline-flex items-center min-h-[44px] text-sm font-medium text-primary hover:underline"
      >
        Open the lease
      </Link>
    </div>
  );
}
