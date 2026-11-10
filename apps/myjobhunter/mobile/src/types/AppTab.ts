import type { WebPath } from "@platform/mobile";

export interface AppTab {
  /** The route file under app/(app)/(tabs), such as "index". */
  name: string;
  title: string;
  /** The website page this tab stands in for. */
  webPath: WebPath;
}
