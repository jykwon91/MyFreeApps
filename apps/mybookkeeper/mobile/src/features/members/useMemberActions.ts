import { useListMembersQuery, useRemoveMemberMutation, useUpdateMemberRoleMutation } from "@mybookkeeper/api-client/store/membersApi";
import type { AssignableRole } from "@mybookkeeper/api-client/types/organization/AssignableRole";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { useToast } from "@platform/mobile";
import { MEMBERS_MESSAGES as MESSAGES, ROLE_WITH_ARTICLE } from "../../constants/members";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { memberName } from "./membersDisplay";
import { useAccessRefused } from "./useAccessRefused";
import { useBusyRows } from "./useBusyRows";

export function useMemberActions(orgId: string) {
  const { showToast } = useToast();
  const [updateRole] = useUpdateMemberRoleMutation();
  const [remove] = useRemoveMemberMutation();
  const { refetch } = useListMembersQuery(orgId);
  const accessRefused = useAccessRefused();
  const { busy, runOnce } = useBusyRows();

  /** The server commits before it answers, so a lost answer doesn't mean nothing happened. */
  async function settle(
    error: unknown,
    member: OrgMember,
    happened: (latest: readonly OrgMember[]) => boolean,
    success: string,
  ): Promise<void> {
    const status = httpStatus(error);
    if (status === 403) {
      accessRefused(error);
      return;
    }
    const latest = await refetch();
    if (status === 404) showToast(MESSAGES.alreadyRemoved(memberName(member)), "error");
    else if (!latest.isSuccess) showToast(MESSAGES.unsure, "error");
    else if (happened(latest.data)) showToast(success);
    else showToast(MESSAGES.didntGoThrough, "error");
  }

  function changeRole(member: OrgMember, role: AssignableRole): Promise<void> {
    const success = MESSAGES.roleChanged(memberName(member), ROLE_WITH_ARTICLE[role]);
    return runOnce(member.user_id, MESSAGES.saving, async () => {
      try {
        await updateRole({ orgId, userId: member.user_id, orgRole: role }).unwrap();
        showToast(success);
      } catch (error) {
        await settle(error, member, (latest) => latest.some((row) => row.user_id === member.user_id && row.org_role === role), success);
      }
    });
  }

  function removeMember(member: OrgMember): Promise<void> {
    const success = MESSAGES.removed(memberName(member));
    return runOnce(member.user_id, MESSAGES.removing, async () => {
      try {
        await remove({ orgId, userId: member.user_id }).unwrap();
        showToast(success);
      } catch (error) {
        await settle(error, member, (latest) => !latest.some((row) => row.user_id === member.user_id), success);
      }
    });
  }

  return { busy, changeRole, removeMember };
}
