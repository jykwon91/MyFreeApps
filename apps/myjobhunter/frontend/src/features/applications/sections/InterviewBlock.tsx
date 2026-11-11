import InterviewDetailsSummary from "@/features/applications/InterviewDetailsSummary";
import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

interface InterviewBlockProps {
  event: ApplicationEvent;
}

export default function InterviewBlock({ event }: InterviewBlockProps) {
  if (!event.interview_details) return null;
  return <InterviewDetailsSummary details={event.interview_details} />;
}
