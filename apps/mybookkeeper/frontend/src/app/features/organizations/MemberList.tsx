import { useState } from "react";
import { useListMembersQuery, useUpdateMemberRoleMutation, useRemoveMemberMutation } from "@/shared/store/membersApi";
import { useActiveOrgId } from "@/shared/hooks/useCurrentOrg";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import type { OrgRole } from "@/shared/types/organization/org-role";
import type { OrgMember } from "@/shared/types/organization/member";
import Badge from "@/shared/components/ui/Badge";
import Select from "@/shared/components/ui/Select";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import { ROLE_BADGE_COLORS, ROLE_OPTIONS } from "@/shared/lib/organization-config";

export interface MemberListProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function MemberList({ onError, onSuccess }: MemberListProps) {
  const orgId = useActiveOrgId();
  const { user } = useCurrentUser();
  const isAdmin = useIsOrgAdmin();
  const { data: members = [] } = useListMembersQuery(orgId!, { skip: !orgId });
  const [updateRole, { isLoading: isUpdatingRole }] = useUpdateMemberRoleMutation();
  const [removeMember, { isLoading: isRemoving }] = useRemoveMemberMutation();
  const [confirmRemove, setConfirmRemove] = useState<OrgMember | null>(null);

  async function handleRoleChange(member: OrgMember, newRole: OrgRole) {
    if (!orgId) return;
    try {
      await updateRole({ orgId, userId: member.user_id, orgRole: newRole }).unwrap();
      onSuccess(`Updated ${member.user_email ?? "member"} to ${newRole}`);
    } catch (err) {
      onError(extractErrorMessage(err));
    }
  }

  async function handleRemove() {
    if (!orgId || !confirmRemove) return;
    try {
      await removeMember({ orgId, userId: confirmRemove.user_id }).unwrap();
      onSuccess(`Removed ${confirmRemove.user_email ?? "member"}`);
      setConfirmRemove(null);
    } catch (err) {
      onError(extractErrorMessage(err));
      setConfirmRemove(null);
    }
  }

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No members yet.</p>;
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Member</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              {isAdmin ? <th className="text-right px-4 py-3 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isSelf = member.user_id === user?.id;
              return (
                <tr key={member.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{member.user_name ?? member.user_email ?? "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">{member.user_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && !isSelf ? (
                      <Select
                        value={member.org_role}
                        onChange={(e) => handleRoleChange(member, e.target.value as OrgRole)}
                        disabled={isUpdatingRole}
                        className="text-xs py-1"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label} — {opt.description}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge
                        label={member.org_role.charAt(0).toUpperCase() + member.org_role.slice(1)}
                        color={ROLE_BADGE_COLORS[member.org_role] ?? "gray"}
                      />
                    )}
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-3 text-right">
                      {!isSelf ? (
                        <button
                          onClick={() => setConfirmRemove(member)}
                          className="text-xs text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">You</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmRemove !== null}
        title="Remove member"
        description={`Are you sure you want to remove ${confirmRemove?.user_email ?? "this member"} from the organization?`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={isRemoving}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(null)}
      />
    </>
  );
}
