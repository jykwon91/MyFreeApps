import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

export interface EventCardProps {
  event: ApplicationEvent;
  /** Only interview events can be edited. */
  onEdit: (event: ApplicationEvent) => void;
}
