import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

export interface EventsSectionProps {
  applicationId: string;
  /** Newest first; undefined until the timeline has loaded. */
  events: readonly ApplicationEvent[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void | Promise<void>;
}
