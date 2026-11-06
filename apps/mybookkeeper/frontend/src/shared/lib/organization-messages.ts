export function removeMemberDescription(email: string | null | undefined): string {
  return `Are you sure you want to remove ${email ?? "this member"} from the organization? If they connected this workspace's Gmail, it's disconnected too.`;
}
