import { Trash2 } from "lucide-react";
import {
  extractErrorMessage,
  showError,
  showSuccess,
} from "@platform/ui";
import InviteStatusBadge from "@/features/admin/invites/InviteStatusBadge";
import { formatInviteDate } from "@/features/admin/invites/formatInviteDate";
import type { Invite } from "@/types/invite/invite";
import { useCancelInviteMutation } from "@/store/invitesApi";

export interface InviteRowProps {
  invite: Invite;
}

/**
 * Single row in the pending-invites table. Shows email, status badge,
 * expiry, and a cancel button. The cancel mutation auto-invalidates
 * the list cache via the `Invite` tag in `invitesApi`.
 */
export default function InviteRow({ invite }: InviteRowProps) {
  const [cancelInvite, { isLoading: isCancelling }] = useCancelInviteMutation();

  async function handleCancel() {
    if (
      !window.confirm(`Cancel invite for ${invite.email}? This cannot be undone.`)
    ) {
      return;
    }
    try {
      await cancelInvite(invite.id).unwrap();
      showSuccess("Invite cancelled");
    } catch (err) {
      showError(`Couldn't cancel: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{invite.email}</p>
          <InviteStatusBadge status={invite.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          Expires {formatInviteDate(invite.expires_at)}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCancel}
        disabled={isCancelling}
        title="Cancel invite"
        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
