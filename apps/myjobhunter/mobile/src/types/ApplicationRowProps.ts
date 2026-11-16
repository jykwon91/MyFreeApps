import type { Application } from "@myjobhunter/api-client/types/application";

export interface ApplicationRowProps {
  application: Application;
  /** Opens the application's own screen. Handed the application so one handler serves every row and the row can stay memoized. */
  onPress: (application: Application) => void;
}
