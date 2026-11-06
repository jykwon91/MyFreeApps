import { useId, useState } from "react";
import SuggestionNotice from "@/games/wow-forever/components/featureRequests/SuggestionNotice";
import SuggestionSendButton from "@/games/wow-forever/components/featureRequests/SuggestionSendButton";
import SuggestionStatusLine from "@/games/wow-forever/components/featureRequests/SuggestionStatusLine";
import FocusHeading from "@/games/wow-forever/components/shared/FocusHeading";
import TurnstileField from "@/games/wow-forever/components/shared/TurnstileField";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import {
  CLARIFY_ANSWER_MAX_LENGTH,
  SUBMIT_TICK_MS,
  SUGGEST_COPY,
} from "@/games/wow-forever/data/featureRequests/suggestCopy";
import type { AboutYouState } from "@/games/wow-forever/types/featureRequests/aboutYouState";
import type { SubmitFailure } from "@/games/wow-forever/types/featureRequests/submitFailure";
import type { SuggestionSubmitState } from "@/games/wow-forever/types/featureRequests/suggestionSubmitState";

interface SuggestionClarifyProps {
  submit: SuggestionSubmitState;
  aboutYou: AboutYouState;
  question: string;
  failure: SubmitFailure | null;
}

/** "One quick question": the idea as sent, the question, a short answer — or "Skip, submit as is". */
export default function SuggestionClarify({ submit, aboutYou, question, failure }: SuggestionClarifyProps) {
  const now = useNow(SUBMIT_TICK_MS);
  const answerId = useId();
  const [reply, setReply] = useState("");
  const { turnstile } = submit;
  const submitting = submit.submittingSince !== null;
  const rateLimited = submit.blockedUntil !== null && submit.blockedUntil > now;
  const waitingForCheck = turnstile.needsToken && turnstile.token === "" && !submitting;
  const send = () => submit.answer(reply.trim(), aboutYou.context);

  return (
    <div className="space-y-4">
      <FocusHeading>{SUGGEST_COPY.clarifyHeading}</FocusHeading>
      <blockquote className="whitespace-pre-wrap break-words rounded-md border-l-4 bg-muted/30 p-3 text-sm text-muted-foreground">
        {submit.text}
      </blockquote>
      <div className="space-y-1.5">
        <label htmlFor={answerId} className="block font-medium">
          {question}
        </label>
        <textarea
          id={answerId}
          rows={2}
          maxLength={CLARIFY_ANSWER_MAX_LENGTH}
          readOnly={submitting}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          className="block w-full rounded-md border bg-background p-3 text-base read-only:opacity-70"
        />
      </div>
      {failure !== null ? (
        <SuggestionNotice
          failure={failure}
          blockedUntil={submit.blockedUntil}
          onRetry={send}
          retryDisabled={submitting || waitingForCheck}
          onEdit={submit.correct}
        />
      ) : null}
      <TurnstileField
        resetKey={turnstile.resetKey}
        expired={turnstile.expired}
        onVerify={turnstile.onVerify}
        onExpire={turnstile.onExpire}
        onRetry={turnstile.reset}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SuggestionSendButton
          label="Send"
          submitting={submitting}
          waitingForCheck={waitingForCheck}
          blocked={rateLimited || reply.trim() === ""}
          onClick={send}
        />
        <button
          type="button"
          onClick={() => submit.answer("", aboutYou.context)}
          disabled={submitting || waitingForCheck || rateLimited}
          className="min-h-[44px] px-2 text-sm text-primary underline underline-offset-2 disabled:opacity-50"
        >
          Skip, submit as is
        </button>
      </div>
      {submit.submittingSince !== null ? (
        <SuggestionStatusLine since={submit.submittingSince} onCancel={submit.cancel} />
      ) : null}
    </div>
  );
}
