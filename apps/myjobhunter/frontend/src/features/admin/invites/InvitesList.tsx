import { EmptyState, Skeleton } from "@platform/ui";
import InviteRow from "@/features/admin/invites/InviteRow";
import { useListInvitesQuery } from "@/store/invitesApi";

const SKELETON_ROWS = 3;

/**
 * Pending-invite table for the admin Invites page. Shows skeleton
 * rows while the list query is in-flight, an empty-state when no
 * invites exist, and an error message when the fetch fails.
 *
 * Skeleton mirrors the loaded layout (h-16 row, full-width) per the
 * MJH skeleton-strategy convention.
 */
export default function InvitesList() {
  const { data, isLoading, isError } = useListInvitesQuery();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load invites. Please refresh.
      </p>
    );
  }

  const invites = data ?? [];

  if (invites.length === 0) {
    return (
      <EmptyState
        icon="Mail"
        heading="No pending invites"
        body="When you invite someone, their pending invite will appear here until they register."
      />
    );
  }

  return (
    <div className="space-y-2">
      {invites.map((invite) => (
        <InviteRow key={invite.id} invite={invite} />
      ))}
    </div>
  );
}
