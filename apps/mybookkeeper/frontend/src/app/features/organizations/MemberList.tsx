import { useState } from "react";
import { useListMembersQuery, useUpdateMemberRoleMutation, useRemoveMemberMutation } from "@mybookkeeper/api-client/store/membersApi";
import { useActiveOrgId } from "@/shared/hooks/useCurrentOrg";
import { useIsOrgAdmin, useOrgRole } from "@/shared/hooks/useOrgRole";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { extractErrorMessage } from "@platform/ui";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import Badge from "@/shared/components/ui/Badge";
import Select from "@/shared/components/ui/Select";
import { ConfirmDialog } from "@platform/ui";
import { ASSIGNABLE_ROLE_OPTIONS } from "@mybookkeeper/api-client/constants/orgRoles";
import { canManageMember } from "@mybookkeeper/api-client/utils/canManageMember";
import { ROLE_BADGE_COLORS } from "@/shared/lib/organization-config";
import { memberRoleLabel, removeMemberDescription } from "@/shared/lib/organization-messages";
import MemberRowAction from "@/app/features/organizations/MemberRowAction";

export interface MemberListProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function MemberList({ onError, onSuccess }: MemberListProps) {
  const orgId = useActiveOrgId();
  const { user } = useCurrentUser();
  const myRole = useOrgRole();
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
              const canManage = canManageMember(member, myRole, isSelf);
              const name = member.user_name || member.user_email || "Unnamed";
              return (
                <tr key={member.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-muted-foreground">{member.user_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <Select
                        value={member.org_role}
                        onChange={(e) => handleRoleChange(member, e.target.value as OrgRole)}
                        disabled={isUpdatingRole}
                        aria-label={memberRoleLabel(name)}
                        className="text-xs py-1"
                      >
                        {ASSIGNABLE_ROLE_OPTIONS.map((opt) => (
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
                      <MemberRowAction
                        isSelf={isSelf}
                        canManage={canManage}
                        name={name}
                        onRemove={() => setConfirmRemove(member)}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove member"
        description={removeMemberDescription(confirmRemove?.user_email)}
        confirmLabel="Remove"
        variant="danger"
        isLoading={isRemoving}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(null)}
      />
    </>
  );
}
