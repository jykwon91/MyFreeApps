/** The user block of the data export (app/services/user/account_service.py build_export). */
export interface ExportedUser {
  id: string;
  email: string;
  display_name: string;
  is_verified: boolean;
  totp_enabled: boolean;
}
