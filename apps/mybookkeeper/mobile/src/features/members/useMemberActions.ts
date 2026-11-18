import { membersApi, useRemoveMemberMutation, useUpdateMemberRoleMutation } from "@mybookkeeper/api-client/store/membersApi";
import type { AssignableRole } from "@mybookkeeper/api-client/types/organization/AssignableRole";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { useToast } from "@platform/mobile";
import { MEMBERS_MESSAGES as MESSAGES, ROLE_WITH_ARTICLE } from "../../constants/members";
import { OWNER_ONLY_ADMIN_MESSAGE } from "@mybookkeeper/api-client/constants/ownerOnlyRefusal";
import { isCancelledRequest } from "@mybookkeeper/api-client/utils/isCancelledRequest";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isOwnerOnlyRefusal } from "@mybookkeeper/api-client/utils/isOwnerOnlyRefusal";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../lib/store";
import { memberName } from "./membersDisplay";
import { useAccessRefused } from "./useAccessRefused";
import { useBusyRows } from "./useBusyRows";

export function useMemberActions(orgId: string) {
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const [updateRole] = useUpdateMemberRoleMutation();
  const [remove] = useRemoveMemberMutation();
  const accessRefused = useAccessRefused();
  const { busy, runOnce } = useBusyRows();

  /** Not the hook's refetch: that throws once the screen has gone and its query with it. */
  function latestMembers() {
    return dispatch(membersApi.endpoints.listMembers.initiate(orgId, { forceRefetch: true, subscribe: false }));
  }

  /** The server commits before it answers, so a lost answer doesn't mean nothing happened. */
  async function settle(
    error: unknown,
    member: OrgMember,
    happened: (latest: readonly OrgMember[]) => boolean,
    success: string,
  ): Promise<void> {
    // Cancelled by a cache reset (sign-out, workspace switch): nothing was lost, and nobody is left to tell.
    if (isCancelledRequest(error)) return;
    const status = httpStatus(error);
    if (isOwnerOnlyRefusal(error)) {
      showToast(OWNER_ONLY_ADMIN_MESSAGE, "error");
      return;
    }
    if (status === 403) {
      accessRefused(error);
      return;
    }
    const latest = await latestMembers();
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
