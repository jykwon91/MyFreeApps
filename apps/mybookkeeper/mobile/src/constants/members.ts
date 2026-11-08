import { PROMOTE_ADMIN_MESSAGES } from "@mybookkeeper/api-client/constants/promoteAdminMessages";
import { INVITE_EMAIL_MESSAGES } from "@mybookkeeper/api-client/constants/inviteMessages";
import type { AssignableRole } from "@mybookkeeper/api-client/types/organization/AssignableRole";

export const ROLE_WITH_ARTICLE: Record<AssignableRole, string> = {
  admin: "an admin",
  user: "a user",
  viewer: "a viewer",
};

/** The server's wording, matched and never shown. */
export const ALREADY_MEMBER_DETAIL = "This user is already a member of this organization";
export const NOT_A_MEMBER_DETAIL = "Not a member of this organization";

export const MEMBERS_MESSAGES = {
  people: (count: number) => `People (${count})`,
  waiting: (count: number) => `Waiting to join (${count})`,
  you: "You",
  inviteSomeone: "Invite someone",
  noneWaiting: "No one is waiting to join. Invite someone above.",
  onlyAdmins: "Only owners and admins can invite people or change roles.",
  demoNote: "Demo workspaces can't invite people.",
  couldntLoad: "I couldn't load the members.",
  checkConnection: "Check your connection and try again.",
  tryAgainLater: "Something went wrong on my side. Try again in a moment.",
  tryAgain: "Try again",
  couldntLoadInvites: "I couldn't load the pending invites.",
  expiresIn: (days: number) => `Expires in ${days} ${days === 1 ? "day" : "days"}`,
  expired: "Expired",
  emailDidntSend: INVITE_EMAIL_MESSAGES.didntSend,
  cancelInvite: "Cancel invite",
  cancelling: "Cancelling…",
  inviteAgain: "Invite again",
  saving: "Saving…",
  removing: "Removing…",
  close: "Close",
  role: "Role",
  removeFrom: (org: string) => `Remove from ${org}`,
  promoteTitle: PROMOTE_ADMIN_MESSAGES.title,
  promoteBody: PROMOTE_ADMIN_MESSAGES.body,
  promoteConfirm: PROMOTE_ADMIN_MESSAGES.confirm,
  removeTitle: (name: string) => `Remove ${name}?`,
  removeBody: (org: string) =>
    `They'll lose access to ${org} right away: its transactions, documents, leases and everything else in it. Their account stays, and what they added stays in ${org}. If they connected ${org}'s Gmail, it's disconnected too. You can invite them again later.`,
  removeConfirm: (firstName: string) => `Remove ${firstName}`,
  roleChanged: (name: string, role: string) => `${name} is now ${role}.`,
  removed: (name: string) => `I removed ${name}.`,
  alreadyRemoved: (name: string) => `${name} was already removed.`,
  inviteCancelled: (email: string) => `I cancelled the invite for ${email}.`,
  inviteGone: "That invite is already gone.",
  didntGoThrough: "That didn't go through. Try again.",
  unsure: "I'm not sure that worked. Pull down to refresh and check.",
  notAllowed: "I'm not allowed to do that anymore. Your role may have changed.",
  inviteTitle: "Invite someone",
  email: "Email",
  emailHint: (org: string) => `I'll email them a link to join ${org}.`,
  theirRole: "Their role",
  sendInvite: "Send invite",
  sending: "Sending…",
  cancel: "Cancel",
  invalidEmail: "That doesn't look like an email address.",
  alreadyIn: (email: string, org: string) => `${email} is already in ${org}.`,
  alreadyPending: (email: string) => `I already have a pending invite for ${email}.`,
  inviteSent: (email: string) => `I sent ${email} an invite. They finish joining from the link in the email, on the website.`,
  inviteEmailFailed: INVITE_EMAIL_MESSAGES.failed,
  inviteWentThrough: "That invite did go through.",
  couldntSend: "I couldn't send that. Check your connection and try again.",
  couldntSendServer: "I couldn't send that. Try again in a moment.",
  workspaceLost: (from: string, to: string) => `You no longer have access to ${from}. I've switched you to ${to}.`,
} as const;
