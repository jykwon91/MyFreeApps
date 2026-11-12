import { ShieldCheck } from "lucide-react";
import { Button } from "@platform/ui";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";

interface PrivacyNoticeProps {
  onContinue: () => void;
  onTypeInstead: () => void;
}

/**
 * Shown once, before the browser's first microphone prompt, so the learner
 * knows where their voice and words go before granting access.
 */
export default function PrivacyNotice({ onContinue, onTypeInstead }: PrivacyNoticeProps) {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3" aria-labelledby="voice-privacy-heading">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="voice-privacy-heading" className="font-semibold">
          {VOICE_COPY.privacyHeading}
        </h2>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          Your browser turns your speech into text. Chrome and Edge send the audio to Google to do
          this; Safari sends it to Apple. We never receive or store your audio.
        </li>
        <li>{VOICE_COPY.privacyTutor}</li>
        <li>{VOICE_COPY.privacySaved}</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onContinue}>{VOICE_COPY.privacyContinue}</Button>
        <Button variant="secondary" onClick={onTypeInstead}>
          {VOICE_COPY.typeInstead}
        </Button>
      </div>
    </section>
  );
}
