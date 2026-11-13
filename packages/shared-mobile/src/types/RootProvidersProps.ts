import type { ReactNode } from "react";
import type { MobileSession } from "./MobileSession";

export interface RootProvidersProps {
  session: MobileSession;
  children: ReactNode;
}
