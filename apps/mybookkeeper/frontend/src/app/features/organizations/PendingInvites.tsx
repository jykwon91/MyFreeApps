import { useListInvitesQuery, useCancelInviteMutation } from "@/shared/store/membersApi";
import { useActiveOrgId } from "@/shared/hooks/useCurrentOrg";
import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import Badge from "@/shared/components/ui/Badge";
import { INVITE_STATUS_COLORS } from "@/shared/lib/organization-config";

interface Props {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function PendingInvites({ onSuccess, onError }: Props) {
  const orgId = useActiveOrgId();
  const { data: invites = [] } = useListInvitesQuery(orgId!, { skip: !orgId });
  const [cancelInvite] = useCancelInviteMutation();

  const pendingInvites = invites.filter((inv) => inv.status === "pending");

  if (pendingInvites.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending invites.</p>;
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
          {pendingInvites.map((invite) => (
            <tr key={invite.id} className="border-b last:border-b-0">
              <td className="px-4 py-3">{invite.email}</td>
              <td className="px-4 py-3 capitalize">{invite.org_role}</td>
              <td className="px-4 py-3">
                <Badge label={invite.status.charAt(0).toUpperCase() + invite.status.slice(1)} color={INVITE_STATUS_COLORS[invite.status]} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={async () => {
                    if (!orgId) return;
                    try {
                      await cancelInvite({ orgId, inviteId: invite.id }).unwrap();
                      onSuccess?.(`Invite for ${invite.email} cancelled`);
                    } catch {
                      onError?.("Failed to cancel invite");
                    }
                  }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Cancel invite"
                >
                  <X size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
