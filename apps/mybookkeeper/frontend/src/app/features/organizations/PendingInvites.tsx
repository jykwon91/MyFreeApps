import { useState } from "react";
import { useCancelInviteMutation, useCreateInviteMutation, useListInvitesQuery } from "@mybookkeeper/api-client/store/membersApi";
import { INVITE_EMAIL_MESSAGES } from "@mybookkeeper/api-client/constants/inviteMessages";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { inviteAgainRole } from "@mybookkeeper/api-client/utils/inviteAgainRole";
import { isInviteExpired } from "@mybookkeeper/api-client/utils/isInviteExpired";
import { useActiveOrgId } from "@/shared/hooks/useCurrentOrg";
import { LoadingButton, extractErrorMessage } from "@platform/ui";
import { formatDistanceToNow } from "date-fns";
import { Loader2, X } from "lucide-react";
import Badge from "@/shared/components/ui/Badge";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { INVITE_STATUS_COLORS } from "@/shared/lib/organization-config";
import {
  INVITE_MESSAGES,
  cancelInviteLabel,
  inviteCancelledMessage,
  inviteSentMessage,
  sendInviteAgainLabel,
} from "@/shared/lib/organization-messages";

export interface PendingInvitesProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function PendingInvites({ onSuccess, onError }: PendingInvitesProps) {
  const orgId = useActiveOrgId();
  const { currentData: invites, error, isFetching, refetch } = useListInvitesQuery(orgId!, { skip: !orgId });
  const [cancelInvite] = useCancelInviteMutation();
  const [createInvite] = useCreateInviteMutation();
  const [busyAction, setBusyAction] = useState<ReadonlyMap<string, "cancel" | "resend">>(new Map());
  const now = new Date();

  const pendingInvites = (invites ?? []).filter((inv) => inv.status === "pending");

  async function runOnce(invite: OrgInvite, action: "cancel" | "resend", work: (orgId: string) => Promise<void>) {
    if (!orgId || busyAction.has(invite.id)) return;
    setBusyAction((busy) => new Map(busy).set(invite.id, action));
    try {
      await work(orgId);
    } finally {
      setBusyAction((busy) => {
        const next = new Map(busy);
        next.delete(invite.id);
        return next;
      });
    }
  }

  function handleCancel(invite: OrgInvite) {
    return runOnce(invite, "cancel", async (orgId) => {
      try {
        await cancelInvite({ orgId, inviteId: invite.id }).unwrap();
        onSuccess?.(inviteCancelledMessage(invite.email));
      } catch (err) {
        const status = httpStatus(err);
        // A failed cancel still reloads the list: cancelInvite invalidates "Invites" either way.
        if (status === 404) {
          onError?.(INVITE_MESSAGES.inviteGone);
        } else if (status === 403) {
          onError?.(extractErrorMessage(err));
        } else {
          onError?.(INVITE_MESSAGES.couldntCancel);
        }
      }
    });
  }

  function handleSendAgain(invite: OrgInvite) {
    return runOnce(invite, "resend", async (orgId) => {
      try {
        // The server replaces the pending invite, so only the new link works.
        const sent = await createInvite({ orgId, email: invite.email, orgRole: inviteAgainRole(invite) }).unwrap();
        if (sent.email_sent) onSuccess?.(inviteSentMessage(invite.email));
        else onError?.(INVITE_EMAIL_MESSAGES.failed(invite.email));
      } catch (err) {
        const status = httpStatus(err);
        // 400 is "already a member", 403 a role change: both carry a reason worth reading.
        onError?.(status === 400 || status === 403 ? extractErrorMessage(err) : INVITE_MESSAGES.couldntSendAgain);
      }
    });
  }

  // Never loaded. On a failure RTK Query has already tried twice: once for the page, and
  // again when this list mounted and subscribed to the failed query.
  if (invites === undefined) {
    return error ? (
      <LoadErrorAlert message={INVITE_MESSAGES.couldntLoad} isRetrying={isFetching} onRetry={() => void refetch()} />
    ) : null;
  }

  if (pendingInvites.length === 0) {
    return <p className="text-sm text-muted-foreground">{INVITE_MESSAGES.none}</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Email</th>
            <th className="text-left px-4 py-3 font-medium">Role</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Expires</th>
            <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {pendingInvites.map((invite) => {
            const expired = isInviteExpired(invite, now);
            const action = busyAction.get(invite.id);
            const busy = action !== undefined;
            return (
              <tr key={invite.id} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div>{invite.email}</div>
                  {invite.email_sent ? null : (
                    <div className="text-xs text-destructive">{INVITE_EMAIL_MESSAGES.didntSend}</div>
                  )}
                </td>
                <td className="px-4 py-3 capitalize">{invite.org_role}</td>
                <td className="px-4 py-3">
                  <Badge
                    label={expired ? INVITE_MESSAGES.expired : INVITE_MESSAGES.pending}
                    color={INVITE_STATUS_COLORS[expired ? "expired" : "pending"]}
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <LoadingButton
                      variant="secondary"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => void handleSendAgain(invite)}
                      disabled={busy}
                      isLoading={action === "resend"}
                      loadingText={INVITE_MESSAGES.sending}
                      aria-label={sendInviteAgainLabel(invite.email)}
                    >
                      {INVITE_MESSAGES.sendAgain}
                    </LoadingButton>
                    <button
                      onClick={() => handleCancel(invite)}
                      disabled={busy}
                      aria-busy={busy}
                      aria-label={cancelInviteLabel(invite.email)}
                      title={cancelInviteLabel(invite.email)}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                    >
                      {action === "cancel" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
