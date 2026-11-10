import type { Application } from "@myjobhunter/api-client/types/application";

export interface ApplicationRowProps {
  application: Application;
  /** Opens the application's own screen. */
  onPress: () => void;
}
