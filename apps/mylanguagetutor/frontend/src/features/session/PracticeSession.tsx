import { useRef, useState } from "react";
import { useSpeechSynthesis } from "@/features/speech/useSpeechSynthesis";
import { useSpeechRecognition } from "@/features/speech/useSpeechRecognition";
import { usePracticeSession } from "@mylanguagetutor/api-client/hooks/usePracticeSession";
import { streamTurn } from "@/features/tutor-stream/streamTurn";
import { useVoiceInput } from "@mylanguagetutor/api-client/hooks/useVoiceInput";
import { ackVoicePrivacy, hasAckedVoicePrivacy } from "@/features/session/privacyAck";
import TranscriptList from "@/features/session/TranscriptList";
import VoiceComposer from "@/features/session/VoiceComposer";
import TextFallbackInput from "@/features/session/TextFallbackInput";
import PrivacyNotice from "@/features/session/PrivacyNotice";
import MicDeniedState from "@/features/session/MicDeniedState";
import SessionBlockNotice from "@/features/session/SessionBlockNotice";
import TurnErrorAlert from "@/features/session/TurnErrorAlert";
import ScenarioGoals from "@/features/session/ScenarioGoals";
import ScenarioCompleteBanner from "@/features/session/ScenarioCompleteBanner";
import { useGetUsageTodayQuery } from "@mylanguagetutor/api-client/store/usageApi";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { startConversationPrompt } from "@mylanguagetutor/api-client/utils/startConversationPrompt";
import { typedAnswerLabel } from "@mylanguagetutor/api-client/utils/typedAnswerLabel";
import { typedAnswerPlaceholder } from "@mylanguagetutor/api-client/utils/typedAnswerPlaceholder";
import { usageBlock } from "@mylanguagetutor/api-client/utils/usageBlock";
import { replayRate } from "@mylanguagetutor/api-client/utils/replayRate";
import type { PracticeSessionProps } from "@/types/session/practice-session-props";

/**
 * The practice screen's conversation loop: listen -> send -> stream the
 * reply (spoken sentence by sentence) -> show corrections -> listen again.
 * Falls back to typed practice where the browser can't recognise speech.
 */
export default function PracticeSession({ language, scenario, level }: PracticeSessionProps) {
  const synthesis = useSpeechSynthesis(language.tts_locale);
  const session = usePracticeSession({
    languageCode: language.code,
    ttsLocale: language.tts_locale,
    scenarioSlug: scenario.slug,
    level,
    streamTurn,
    speak: synthesis.enqueue,
    stopSpeaking: synthesis.cancel,
  });
  const recognition = useSpeechRecognition(language.stt_locale, session.send);
  const usage = useGetUsageTodayQuery();
  const [privacyAcked, setPrivacyAcked] = useState(hasAckedVoicePrivacy);
  const [completeDismissed, setCompleteDismissed] = useState(false);
  const textInput = useRef<HTMLInputElement>(null);
  const block = session.block ?? usageBlock(usage.data);
  const voice = useVoiceInput({
    recognition,
    speaking: synthesis.speaking,
    stopSpeaking: synthesis.cancel,
    requestPhase: session.requestPhase,
    block,
    privacyAcked,
    ackPrivacy: () => {
      ackVoicePrivacy();
      setPrivacyAcked(true);
    },
  });
  const busy = session.requestPhase !== "idle";

  const replay = (text: string, slow: boolean) => {
    synthesis.speakAll(text, replayRate(slow));
  };

  const tryRetryPrompt = () => {
    if (voice.mode === "voice") voice.startListening();
    else textInput.current?.focus();
  };

  return (
    <div className="flex min-h-[60vh] flex-col gap-4">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{scenario.title}</h1>
        <p className="text-sm text-muted-foreground">{scenario.goal}</p>
        <ScenarioGoals goals={scenario.goals} met={session.scenarioState.goals_met} />
      </header>

      <div className="flex-1">
        {session.entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {startConversationPrompt(language.display_name)}
          </p>
        ) : (
          <TranscriptList
            entries={session.entries}
            languageName={language.display_name}
            canSpeak={synthesis.supported}
            canReplay={voice.canReplay}
            waiting={session.requestPhase === "waiting"}
            busy={busy}
            onReplay={replay}
            onTryRetry={tryRetryPrompt}
            onSkipRetry={session.dismissRetryPrompt}
          />
        )}
      </div>

      {session.scenarioState.complete && !completeDismissed && (
        <ScenarioCompleteBanner onKeepTalking={() => setCompleteDismissed(true)} />
      )}

      {session.failure && (
        <TurnErrorAlert failure={session.failure} onRetry={session.retry} onDismiss={session.dismissFailure} />
      )}

      <div className="sticky bottom-0 space-y-3 border-t bg-background py-4">
        {block && <SessionBlockNotice block={block} />}
        {voice.view === "denied" && <MicDeniedState onTypeInstead={voice.switchToText} />}
        {voice.view === "privacy" && (
          <PrivacyNotice onContinue={voice.acceptPrivacy} onTypeInstead={voice.switchToText} />
        )}
        {voice.view === "voice" && (
          <VoiceComposer
            phase={voice.phase}
            interim={recognition.interim}
            failure={recognition.failure}
            micDisabled={busy}
            onStart={voice.startListening}
            onStop={recognition.stop}
            onTypeInstead={voice.switchToText}
          />
        )}
        {voice.view === "text" && (
          <div className="space-y-2">
            <TextFallbackInput
              label={typedAnswerLabel(recognition.supported)}
              placeholder={typedAnswerPlaceholder(language.display_name)}
              busy={busy}
              disabled={busy}
              onSend={session.send}
              inputRef={textInput}
            />
            {!recognition.supported && (
              <p className="text-xs text-muted-foreground">
                This browser can't turn speech into text, so you'll practice by typing. Chrome,
                Edge, or Safari let you practice speaking.
              </p>
            )}
            {recognition.supported && (
              <button
                type="button"
                onClick={voice.switchToVoice}
                className="min-h-[44px] px-2 text-xs text-muted-foreground underline"
              >
                {VOICE_COPY.useMicrophone}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
