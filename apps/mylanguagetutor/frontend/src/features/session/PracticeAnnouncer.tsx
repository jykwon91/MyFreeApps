import type { PracticeAnnouncerProps } from "@/types/session/practice-announcer-props";

/**
 * The practice screen's one live region, mounted for the whole conversation so screen readers are
 * listening before anything is put in it. Everything the screen reader should say goes in here
 * (`practiceAnnouncements`): the finished reply, the phases that aren't listening, a failed turn, a
 * block, scenario complete. Never what the microphone is hearing, which it would then hear read back,
 * and never a reply still streaming in, which would be read chunk by chunk over the tutor's voice.
 * Each message is its own entry, so a new one is read without reading the others again.
 */
export default function PracticeAnnouncer({ messages }: PracticeAnnouncerProps) {
  return (
    <div
      className="sr-only"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      data-testid="practice-announcer"
    >
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}
