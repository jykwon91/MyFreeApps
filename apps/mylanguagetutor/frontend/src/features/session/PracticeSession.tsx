import { useCallback, useRef, useState } from "react";
import { useSpeechSynthesis, NORMAL_RATE, SLOW_RATE } from "@/features/speech/useSpeechSynthesis";
import { useSpeechRecognition } from "@/features/speech/useSpeechRecognition";
import { usePracticeSession } from "@/features/session/usePracticeSession";
import { voicePhase } from "@/features/session/voicePhase";
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
import { useGetUsageTodayQuery } from "@/store/usageApi";
import type { Language } from "@/types/catalog/language";
import type { Scenario } from "@/types/catalog/scenario";
import type { Level } from "@/types/tutor/level";
import type { InputMode } from "@/types/session/input-mode";
import type { SessionBlock } from "@/types/session/session-block";
import type { UsageToday } from "@/types/tutor/usage-today";

interface PracticeSessionProps {
  language: Language;
  scenario: Scenario;
  level: Level;
}

/** Up-front budget check, so a capped learner isn't asked to record first. */
function usageBlock(usage: UsageToday | undefined): SessionBlock | null {
  if (!usage) return null;
  if (!usage.tutor_available) return "unavailable";
  if (usage.cap_reached) return "daily_limit";
  return null;
}

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
    speak: synthesis.enqueue,
    stopSpeaking: synthesis.cancel,
  });
  const recognition = useSpeechRecognition(language.stt_locale, session.send);
  const usage = useGetUsageTodayQuery();
  const [mode, setMode] = useState<InputMode>(recognition.supported ? "voice" : "text");
  const [privacyAcked, setPrivacyAcked] = useState(hasAckedVoicePrivacy);
  const [completeDismissed, setCompleteDismissed] = useState(false);
  const textInput = useRef<HTMLInputElement>(null);

  const phase = voicePhase({
    listening: recognition.listening,
    requestPhase: session.requestPhase,
    speaking: synthesis.speaking,
  });
  const busy = session.requestPhase !== "idle";
  const block = session.block ?? usageBlock(usage.data);

  const startListening = useCallback(() => {
    if (block || busy) return;
    synthesis.cancel(); // barge-in: talking over the tutor stops it
    recognition.start();
  }, [block, busy, recognition, synthesis]);

  const acceptPrivacy = () => {
    ackVoicePrivacy();
    setPrivacyAcked(true);
    startListening();
  };

  const switchToText = () => {
    recognition.stop();
    recognition.clearFailure();
    setMode("text");
  };

  const replay = (text: string, slow: boolean) => {
    synthesis.speakAll(text, slow ? SLOW_RATE : NORMAL_RATE);
  };

  const tryRetryPrompt = () => {
    if (mode === "voice") startListening();
    else textInput.current?.focus();
  };

  const showDenied = mode === "voice" && recognition.failure === "denied";
  const showPrivacy = mode === "voice" && !privacyAcked && !block;

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
            Say hello in {language.display_name} to start the conversation.
          </p>
        ) : (
          <TranscriptList
            entries={session.entries}
            languageName={language.display_name}
            canSpeak={synthesis.supported}
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
        {!block && showDenied && <MicDeniedState onTypeInstead={switchToText} />}
        {!block && !showDenied && showPrivacy && (
          <PrivacyNotice onContinue={acceptPrivacy} onTypeInstead={switchToText} />
        )}
        {!block && !showDenied && !showPrivacy && mode === "voice" && (
          <VoiceComposer
            phase={phase}
            interim={recognition.interim}
            failure={recognition.failure}
            micDisabled={busy}
            onStart={startListening}
            onStop={recognition.stop}
            onTypeInstead={switchToText}
          />
        )}
        {!block && mode === "text" && (
          <div className="space-y-2">
            <TextFallbackInput
              label={recognition.supported ? "Type your answer" : "Typing practice (not speaking)"}
              placeholder={`Write in ${language.display_name}…`}
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
                onClick={() => setMode("voice")}
                className="min-h-[44px] px-2 text-xs text-muted-foreground underline"
              >
                Use the microphone
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
