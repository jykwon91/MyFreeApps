import { useId, type RefObject } from "react";
import SuggestionAboutYou from "@/games/wow-forever/components/featureRequests/SuggestionAboutYou";
import SuggestionCharacterCount from "@/games/wow-forever/components/featureRequests/SuggestionCharacterCount";
import SuggestionNotice from "@/games/wow-forever/components/featureRequests/SuggestionNotice";
import SuggestionSendButton from "@/games/wow-forever/components/featureRequests/SuggestionSendButton";
import SuggestionStatusLine from "@/games/wow-forever/components/featureRequests/SuggestionStatusLine";
import TurnstileField from "@/games/wow-forever/components/shared/TurnstileField";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import {
  SUBMIT_TICK_MS,
  SUGGEST_COPY,
  SUGGESTION_MAX_LENGTH,
} from "@/games/wow-forever/data/featureRequests/suggestCopy";
import type { AboutYouState } from "@/games/wow-forever/types/featureRequests/aboutYouState";
import type { SubmitFailure } from "@/games/wow-forever/types/featureRequests/submitFailure";
import type { SuggestionSubmitState } from "@/games/wow-forever/types/featureRequests/suggestionSubmitState";

interface SuggestionFormProps {
  submit: SuggestionSubmitState;
  aboutYou: AboutYouState;
  failure: SubmitFailure | null;
  /** Back from "That's not what I meant". */
  correcting: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/** The idea box, "About you", the human check and "Send my idea" — with whatever went wrong last time above the button. */
export default function SuggestionForm({ submit, aboutYou, failure, correcting, textareaRef }: SuggestionFormProps) {
  const now = useNow(SUBMIT_TICK_MS);
  const textareaId = useId();
  const helperId = useId();
  const counterId = useId();
  const { turnstile } = submit;
  const submitting = submit.submittingSince !== null;
  const rateLimited = submit.blockedUntil !== null && submit.blockedUntil > now;
  const waitingForCheck = turnstile.needsToken && turnstile.token === "" && !submitting;
  const send = () => submit.send(aboutYou.context);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={textareaId} className="block font-medium">
          {SUGGEST_COPY.label}
        </label>
        {correcting ? <p className="text-sm text-primary">{SUGGEST_COPY.wrongHint}</p> : null}
        <textarea
          ref={textareaRef}
          id={textareaId}
          rows={4}
          required
          maxLength={SUGGESTION_MAX_LENGTH}
          readOnly={submitting}
          value={submit.text}
          onChange={(e) => submit.setText(e.target.value)}
          placeholder={SUGGEST_COPY.placeholder}
          aria-describedby={`${helperId} ${counterId}`}
          className="block w-full rounded-md border bg-background p-3 text-base read-only:opacity-70"
        />
        <div className="flex items-start justify-between gap-2">
          <p id={helperId} className="text-xs text-muted-foreground">
            {SUGGEST_COPY.helper}
          </p>
          <SuggestionCharacterCount id={counterId} length={submit.text.length} />
        </div>
      </div>
      <SuggestionAboutYou aboutYou={aboutYou} disabled={submitting} />
      {failure !== null ? (
        <SuggestionNotice
          failure={failure}
          blockedUntil={submit.blockedUntil}
          onRetry={send}
          retryDisabled={submitting || waitingForCheck}
          onEdit={() => textareaRef.current?.focus()}
        />
      ) : null}
      <TurnstileField
        resetKey={turnstile.resetKey}
        expired={turnstile.expired}
        onVerify={turnstile.onVerify}
        onExpire={turnstile.onExpire}
        onRetry={turnstile.reset}
      />
      <div className="space-y-2">
        <SuggestionSendButton
          label={SUGGEST_COPY.submit}
          submitting={submitting}
          waitingForCheck={waitingForCheck}
          blocked={rateLimited}
          onClick={send}
        />
        {submit.submittingSince !== null ? (
          <SuggestionStatusLine since={submit.submittingSince} onCancel={submit.cancel} />
        ) : null}
        <p className="text-xs text-muted-foreground">{SUGGEST_COPY.privacy}</p>
      </div>
    </div>
  );
}
