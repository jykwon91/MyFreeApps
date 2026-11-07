export function removeMemberDescription(email: string | null | undefined): string {
  return `Are you sure you want to remove ${email ?? "this member"} from the organization? If they connected this workspace's Gmail, it's disconnected too.`;
}

export function memberRoleLabel(name: string): string {
  return `Role for ${name}`;
}

export function removeMemberLabel(name: string): string {
  return `Remove ${name}`;
}

export const MEMBER_LIST_MESSAGES = {
  none: "No members yet.",
  couldntLoad: "I couldn't load the members.",
} as const;

export const INVITE_MESSAGES = {
  none: "No pending invites.",
  couldntLoad: "I couldn't load the pending invites.",
  pending: "Pending",
  expired: "Expired",
  inviteGone: "That invite is already gone.",
  couldntCancel: "I couldn't cancel that invite. Try again.",
} as const;

export function inviteSentMessage(email: string): string {
  return `Invite sent to ${email}`;
}

export function inviteCancelledMessage(email: string): string {
  return `Invite for ${email} cancelled`;
}

export function cancelInviteLabel(email: string): string {
  return `Cancel invite for ${email}`;
}
