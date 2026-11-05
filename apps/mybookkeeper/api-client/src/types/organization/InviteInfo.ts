export interface InviteInfo {
  org_name: string;
  org_role: string;
  inviter_name: string;
  email: string;
  expires_at: string;
  is_expired: boolean;
  user_exists: boolean;
}
