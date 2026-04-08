import { useListMembersQuery, useListInvitesQuery } from "@/shared/store/membersApi";
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
  const { isLoading: membersLoading, isFetching: membersFetching } = useListMembersQuery(orgId!, { skip: !orgId });
  const { isLoading: invitesLoading, isFetching: invitesFetching } = useListInvitesQuery(orgId!, { skip: !orgId || !isAdmin });
  const { showError, showSuccess } = useToast();

  if (membersLoading || membersFetching || (isAdmin && (invitesLoading || invitesFetching))) {
    return (
      <div className="p-6">
        <MembersSkeleton />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
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
