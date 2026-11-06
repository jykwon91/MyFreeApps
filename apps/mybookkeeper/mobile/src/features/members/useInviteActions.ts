import { membersApi, useCancelInviteMutation, useCreateInviteMutation } from "@mybookkeeper/api-client/store/membersApi";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { useDispatch } from "react-redux";
import { ALREADY_MEMBER_DETAIL, MEMBERS_MESSAGES as MESSAGES } from "../../constants/members";
import type { AppDispatch } from "../../lib/store";
import type { InviteRequest } from "../../types/InviteRequest";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isInviteExpired } from "@mybookkeeper/api-client/utils/isInviteExpired";
import { isSameEmail } from "./membersDisplay";
import { useAccessRefused } from "./useAccessRefused";
import { useBusyRows } from "./useBusyRows";

export function useInviteActions(orgId: string, orgName: string) {
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const [create] = useCreateInviteMutation();
  const [cancel] = useCancelInviteMutation();
  const accessRefused = useAccessRefused();
  const { busy, runOnce } = useBusyRows();
  const isSending = useRef(false);

  /** Not the hook's refetch: that throws if my role changed while this was on its way. */
  function latestInvites() {
    return dispatch(membersApi.endpoints.listInvites.initiate(orgId, { forceRefetch: true, subscribe: false }));
  }

  /** The problem to show on the form, or null if the form can close. */
  async function sendInvite({ email, role, members, invites, resendingTo, now }: InviteRequest): Promise<string | null> {
    if (isSending.current) return null;
    if (members.some((member) => isSameEmail(member.user_email, email))) return MESSAGES.alreadyIn(email, orgName);
    const isResend = isSameEmail(email, resendingTo);
    if (!isResend && invites.some((invite) => isSameEmail(invite.email, email) && !isInviteExpired(invite, now))) return MESSAGES.alreadyPending(email);

    isSending.current = true;
    try {
      const invite = await create({ orgId, email, orgRole: role }).unwrap();
      if (invite.email_sent) showToast(MESSAGES.inviteSent(email));
      else showToast(MESSAGES.inviteEmailFailed(email), "error");
      return null;
    } catch (error) {
      return await inviteFailure(error, email, new Set(invites.map((invite) => invite.id)));
    } finally {
      isSending.current = false;
    }
  }

  async function inviteFailure(error: unknown, email: string, knownIds: ReadonlySet<string>): Promise<string | null> {
    const status = httpStatus(error);
    if (status === 403) {
      accessRefused(error);
      return null;
    }
    if (status === 422) return MESSAGES.invalidEmail;
    if (status === 400) {
      const detail = (error as { data?: { detail?: unknown } }).data?.detail;
      return detail === ALREADY_MEMBER_DETAIL ? MESSAGES.alreadyIn(email, orgName) : MESSAGES.couldntSendServer;
    }
    // Only a new row counts: an older invite to this address says nothing about this attempt.
    const latest = await latestInvites();
    if (latest.isSuccess && latest.data.some((invite) => invite.status === "pending" && isSameEmail(invite.email, email) && !knownIds.has(invite.id))) {
      showToast(MESSAGES.inviteWentThrough);
      return null;
    }
    return isServerAnswer(error) ? MESSAGES.couldntSendServer : MESSAGES.couldntSend;
  }

  function cancelInvite(invite: OrgInvite): Promise<void> {
    return runOnce(invite.id, MESSAGES.cancelling, async () => {
      const success = MESSAGES.inviteCancelled(invite.email);
      try {
        await cancel({ orgId, inviteId: invite.id }).unwrap();
        showToast(success);
      } catch (error) {
        const status = httpStatus(error);
        if (status === 403) {
          accessRefused(error);
          return;
        }
        const latest = await latestInvites();
        if (status === 404) showToast(MESSAGES.inviteGone, "error");
        else if (!latest.isSuccess) showToast(MESSAGES.unsure, "error");
        else if (latest.data.some((row) => row.id === invite.id)) showToast(MESSAGES.didntGoThrough, "error");
        else showToast(success);
      }
    });
  }

  return { busy, cancelInvite, sendInvite };
}
