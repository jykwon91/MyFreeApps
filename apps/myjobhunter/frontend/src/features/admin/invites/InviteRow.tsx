import { useEffect, useRef, useState } from "react";
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

const CONFIRM_WINDOW_MS = 3000;

/**
 * Single row in the pending-invites table. Shows email, status badge,
 * expiry, and a cancel button.
 *
 * Cancel UX is a two-click inline confirm (no modal, no native alert):
 * first click swaps the trash icon for a "Confirm?" pill that auto-
 * reverts after 3s; second click within that window fires the
 * cancellation. Per design review — see g-design-ux note 2026-05-06.
 */
export default function InviteRow({ invite }: InviteRowProps) {
  const [cancelInvite, { isLoading: isCancelling }] = useCancelInviteMutation();
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearConfirmTimer() {
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }

  // Cancel the pending timeout if the row unmounts (which happens
  // immediately after a successful cancel — RTK Query invalidates the
  // Invite tag and re-renders the list). Prevents a setState on an
  // unmounted component.
  useEffect(() => {
    return () => clearConfirmTimer();
  }, []);

  function startConfirmation() {
    setConfirming(true);
    clearConfirmTimer();
    confirmTimerRef.current = setTimeout(() => {
      setConfirming(false);
      confirmTimerRef.current = null;
    }, CONFIRM_WINDOW_MS);
  }

  async function commitCancel() {
    clearConfirmTimer();
    setConfirming(false);
    try {
      await cancelInvite(invite.id).unwrap();
      showSuccess("Invite cancelled");
    } catch (err) {
      showError(`Couldn't cancel: ${extractErrorMessage(err)}`);
    }
  }

  function handleClick() {
    if (isCancelling) return;
    if (confirming) {
      void commitCancel();
      return;
    }
    startConfirmation();
  }

  function handleBlur() {
    // Tabbing away from the button in confirming state aborts the
    // pending confirmation. Belt-and-braces with the 3s auto-revert.
    if (confirming) {
      clearConfirmTimer();
      setConfirming(false);
    }
  }

  const ariaLabel = confirming
    ? `Confirm cancellation of invite for ${invite.email}`
    : `Cancel invite for ${invite.email}`;

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
      <span aria-live="polite">
        {confirming ? (
          <button
            type="button"
            onClick={handleClick}
            onBlur={handleBlur}
            disabled={isCancelling}
            aria-label={ariaLabel}
            className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 min-h-[44px]"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Confirm?</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            disabled={isCancelling}
            aria-label={ariaLabel}
            title="Cancel invite"
            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </span>
    </div>
  );
}
