import { ROLE_LABELS } from "@mybookkeeper/api-client/constants/orgRoles";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { MEMBERS_MESSAGES as MESSAGES, NOT_A_MEMBER_DETAIL } from "../../constants/members";

const DAY_MS = 24 * 60 * 60 * 1000;

export function memberName(member: OrgMember): string {
  return member.user_name?.trim() || member.user_email || ROLE_LABELS[member.org_role];
}

export function memberFirstName(member: OrgMember): string {
  return member.user_name?.trim().split(/\s+/)[0] || member.user_email || ROLE_LABELS[member.org_role];
}

export function isSameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

export function isInviteExpired(invite: OrgInvite, now: Date): boolean {
  return new Date(invite.expires_at).getTime() <= now.getTime();
}

export function inviteStatusLine(invite: OrgInvite, now: Date): string {
  const role = ROLE_LABELS[invite.org_role];
  if (isInviteExpired(invite, now)) return `${role} · ${MESSAGES.expired}`;
  const days = Math.ceil((new Date(invite.expires_at).getTime() - now.getTime()) / DAY_MS);
  return `${role} · ${MESSAGES.expiresIn(days)}`;
}

/** The owner can't be changed by anyone, and nobody can change their own role or remove themselves. */
export function canEditMember(member: OrgMember, myEmail: string | null, isAdmin: boolean): boolean {
  return isAdmin && member.org_role !== "owner" && !isSameEmail(member.user_email, myEmail);
}

export function isNotMemberRefusal(error: unknown): boolean {
  return (error as { data?: { detail?: unknown } } | null)?.data?.detail === NOT_A_MEMBER_DETAIL;
}
