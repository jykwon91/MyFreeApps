import { useState } from "react";
import { useCreateInviteMutation } from "@/shared/store/membersApi";
import { useActiveOrgId } from "@/shared/hooks/useCurrentOrg";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import type { OrgRole } from "@/shared/types/organization/org-role";
import { INVITE_ROLE_OPTIONS } from "@/shared/lib/organization-config";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Select from "@/shared/components/ui/Select";

export interface InviteFormProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function InviteForm({ onError, onSuccess }: InviteFormProps) {
  const orgId = useActiveOrgId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("user");
  const [createInvite, { isLoading }] = useCreateInviteMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !email.trim()) return;
    try {
      const result = await createInvite({ orgId, email: email.trim(), orgRole: role }).unwrap();
      if (result.email_sent) {
        onSuccess(`Invite sent to ${email.trim()}`);
      } else {
        onSuccess(`Invite created for ${email.trim()}, but the email could not be sent. Share the invite link manually.`);
      }
      setEmail("");
      setRole("user");
    } catch (err) {
      onError(extractErrorMessage(err));
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="invite-email" className="block text-sm font-medium mb-1">Email address</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium mb-1">Role</label>
          <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
            {INVITE_ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>
        <LoadingButton type="submit" isLoading={isLoading} loadingText="Sending...">
          Send invite
        </LoadingButton>
      </form>
      <p className="text-xs text-muted-foreground">Admins can manage members and settings. Users can view and add transactions. Viewers have read-only access.</p>
    </div>
  );
}
