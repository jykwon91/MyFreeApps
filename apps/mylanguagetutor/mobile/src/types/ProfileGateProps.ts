import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import type { ReactNode } from "react";

export interface ProfileGateProps {
  children: (profile: Profile) => ReactNode;
}
