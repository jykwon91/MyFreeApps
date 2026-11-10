import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

export interface EditInterviewSheetProps {
  applicationId: string;
  event: ApplicationEvent;
  onClose: () => void;
}
