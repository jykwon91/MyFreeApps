import type { VideoCallNote } from "@mybookkeeper/api-client/types/applicant/video-call-note";
import InquirySection from "../inquiries/InquirySection";
import { videoCallLines } from "./applicantDisplay";
import ApplicantHistoryItem from "./ApplicantHistoryItem";

export default function ApplicantVideoCalls({ calls }: { calls: VideoCallNote[] }) {
  if (calls.length === 0) return null;
  return (
    <InquirySection title="Video calls">
      {calls.map((call) => (
        <ApplicantHistoryItem key={call.id} lines={videoCallLines(call)} title={call.completed_at ? "Completed" : "Scheduled"} />
      ))}
    </InquirySection>
  );
}
