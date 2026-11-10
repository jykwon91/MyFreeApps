import type { Application } from "@myjobhunter/api-client/types/application";

export interface ApplicationRowProps {
  application: Application;
  /** Opens the application on the website until its own screen is on the phone. */
  onPress: () => void;
}
