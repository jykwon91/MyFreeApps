import type { ProfileUpdate } from "@mylanguagetutor/api-client/types/tutor/profile-update";
import type { ExportedSession } from "./ExportedSession";
import type { ExportedUser } from "./ExportedUser";

/** GET /users/me/export (app/services/user/account_service.py build_export). */
export interface AccountExport {
  exported_at: string;
  user: ExportedUser;
  /** language_code + level only, or null before onboarding. */
  tutor_profile: ProfileUpdate | null;
  tutor_sessions: ExportedSession[];
}
