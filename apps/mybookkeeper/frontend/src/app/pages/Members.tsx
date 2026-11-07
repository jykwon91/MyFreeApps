import { useListMembersQuery, useListInvitesQuery } from "@mybookkeeper/api-client/store/membersApi";
import { useActiveOrgId } from "@/shared/hooks/useCurrentOrg";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import { useToast } from "@/shared/hooks/useToast";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import Card from "@/shared/components/ui/Card";
import MemberList from "@/app/features/organizations/MemberList";
import InviteForm from "@/app/features/organizations/InviteForm";
import PendingInvites from "@/app/features/organizations/PendingInvites";
import MembersSkeleton from "@/app/features/organizations/MembersSkeleton";

export default function Members() {
  const orgId = useActiveOrgId();
  const isAdmin = useIsOrgAdmin();
  const members = useListMembersQuery(orgId!, { skip: !orgId });
  const invites = useListInvitesQuery(orgId!, { skip: !orgId || !isAdmin });
  const { showError, showSuccess } = useToast();

  // Only while this organization has nothing loaded yet. A refetch after an invite or a
  // role change keeps the page, and the invite form's input with it. Goes by `currentData`,
  // not `isLoading`: when the active org changes without a cache reset (setOrganizations
  // falls back to another org once the active one is gone), `data` is still the old org's.
  // A failed load keeps the page too, so its list can say so and offer a retry: RTK Query
  // holds on to `error` until a load succeeds, retries included.
  const waitingForMembers = members.currentData === undefined && members.isFetching && !members.error;
  const waitingForInvites = isAdmin && invites.currentData === undefined && invites.isFetching && !invites.error;
  if (waitingForMembers || waitingForInvites) {
    return (
      <div className="p-6">
        <MembersSkeleton />
      </div>
    );
  }

  return (
    // Keyed by org so a half-typed invite or an open dialog never carries over to another org.
    <div key={orgId ?? undefined} className="p-6 space-y-6 max-w-4xl">
      <SectionHeader title="Members" subtitle="Manage who has access to this organization" />

      <Card title="Team members">
        <MemberList onError={showError} onSuccess={showSuccess} />
      </Card>

      {isAdmin ? (
        <>
          <Card title="Invite a new member">
            <InviteForm onError={showError} onSuccess={showSuccess} />
          </Card>

          <Card title="Pending invites">
            <PendingInvites onSuccess={showSuccess} onError={showError} />
          </Card>
        </>
      ) : null}
    </div>
  );
}
