import ResumeIntro from "./ResumeIntro";
import ResumeScroll from "./ResumeScroll";
import ResumeSessionLoader from "./ResumeSessionLoader";
import ResumeSessionSkeleton from "./ResumeSessionSkeleton";
import ResumeStartPanel from "./ResumeStartPanel";
import { useStoredResumeSession } from "./useStoredResumeSession";

/** The website's /resume page: pick an uploaded resume, work through its suggestions, then download it. */
export default function ResumeScreen() {
  const stored = useStoredResumeSession();

  if (stored.isReading) {
    return (
      <ResumeScroll testID="resume">
        <ResumeSessionSkeleton />
      </ResumeScroll>
    );
  }
  if (stored.sessionId) return <ResumeSessionLoader key={stored.sessionId} onStartNew={stored.forget} sessionId={stored.sessionId} />;
  return (
    <ResumeScroll testID="resume">
      <ResumeIntro />
      <ResumeStartPanel onStarted={stored.remember} />
    </ResumeScroll>
  );
}
