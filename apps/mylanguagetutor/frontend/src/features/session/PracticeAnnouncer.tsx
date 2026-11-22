import type { PracticeAnnouncerProps } from "@/types/session/practice-announcer-props";

/**
 * The practice screen's one live region, mounted for the whole conversation so screen readers are
 * listening before anything is put in it. It only ever holds the finished reply and the phases that
 * aren't listening (`latestReply`, `phaseAnnouncement`, the same ones the phone announces): never what
 * the microphone is hearing, which the microphone would then hear read back, and never a reply still
 * streaming in, which would be read chunk by chunk over the tutor's voice.
 */
export default function PracticeAnnouncer({ message }: PracticeAnnouncerProps) {
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="practice-announcer">
      {message ?? ""}
    </p>
  );
}
