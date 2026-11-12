import type { DisplayNameSource } from "./DisplayNameSource";

export interface DisplayNameSectionProps {
  /** Where the name shows, in this app's words. */
  description: string;
  source: DisplayNameSource;
  onRetry: () => Promise<void>;
}
