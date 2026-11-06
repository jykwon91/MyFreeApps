export function removeMemberDescription(email: string | null | undefined): string {
  return `Are you sure you want to remove ${email ?? "this member"} from the organization? If they connected this workspace's Gmail, it's disconnected too.`;
}

export function memberRoleLabel(name: string): string {
  return `Role for ${name}`;
}

export function removeMemberLabel(name: string): string {
  return `Remove ${name}`;
}
