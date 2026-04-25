import type { Role } from "./role";

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
}
