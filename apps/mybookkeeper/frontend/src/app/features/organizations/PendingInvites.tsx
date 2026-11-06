import { useState } from "react";
import { useListInvitesQuery, useCancelInviteMutation } from "@mybookkeeper/api-client/store/membersApi";
import { INVITE_EMAIL_MESSAGES } from "@mybookkeeper/api-client/constants/inviteMessages";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isInviteExpired } from "@mybookkeeper/api-client/utils/isInviteExpired";
import { useActiveOrgId } from "@/shared/hooks/useCurrentOrg";
import { extractErrorMessage } from "@platform/ui";
import { formatDistanceToNow } from "date-fns";
import { Loader2, X } from "lucide-react";
import Badge from "@/shared/components/ui/Badge";
import { INVITE_STATUS_COLORS } from "@/shared/lib/organization-config";
import {
  INVITE_MESSAGES,
  cancelInviteLabel,
  inviteCancelledMessage,
} from "@/shared/lib/organization-messages";

export interface PendingInvitesProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function PendingInvites({ onSuccess, onError }: PendingInvitesProps) {
  const orgId = useActiveOrgId();
  const { data: invites = [] } = useListInvitesQuery(orgId!, { skip: !orgId });
  const [cancelInvite] = useCancelInviteMutation();
  const [cancelling, setCancelling] = useState<ReadonlySet<string>>(new Set());
  const now = new Date();

  const pendingInvites = invites.filter((inv) => inv.status === "pending");

  async function handleCancel(invite: OrgInvite) {
    if (!orgId || cancelling.has(invite.id)) return;
    setCancelling((ids) => new Set(ids).add(invite.id));
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
    } finally {
      setCancelling((ids) => {
        const next = new Set(ids);
        next.delete(invite.id);
        return next;
      });
    }
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
            <th className="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody>
          {pendingInvites.map((invite) => {
            const expired = isInviteExpired(invite, now);
            const busy = cancelling.has(invite.id);
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
                  <button
                    onClick={() => handleCancel(invite)}
                    disabled={busy}
                    aria-busy={busy}
                    aria-label={cancelInviteLabel(invite.email)}
                    title={cancelInviteLabel(invite.email)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
