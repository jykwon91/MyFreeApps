import { useRef, useState } from "react";
import { useSpeechSynthesis } from "@/features/speech/useSpeechSynthesis";
import { useMicrophonePermission } from "@/features/speech/useMicrophonePermission";
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
import PracticeNoticeAlert from "@/features/session/PracticeNoticeAlert";
import ScenarioGoals from "@/features/session/ScenarioGoals";
import ScenarioCompleteBanner from "@/features/session/ScenarioCompleteBanner";
import PracticeAnnouncer from "@/features/session/PracticeAnnouncer";
import {
  PRACTICE_COMPOSER,
  PRACTICE_HEADER,
  PRACTICE_PAGE,
  PRACTICE_SECTION_IDS,
  PRACTICE_START_PROMPT,
  PRACTICE_TRANSCRIPT,
} from "@/constants/practiceLayout";
import { TYPING_ONLY_NOTE } from "@/constants/typingOnlyCopy";
import { practiceAnnouncements } from "@/utils/practiceAnnouncements";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { startConversationPrompt } from "@mylanguagetutor/api-client/utils/startConversationPrompt";
import { typedAnswerLabel } from "@mylanguagetutor/api-client/utils/typedAnswerLabel";
import { typedAnswerPlaceholder } from "@mylanguagetutor/api-client/utils/typedAnswerPlaceholder";
import { latestReply } from "@mylanguagetutor/api-client/utils/latestReply";
import { recognitionFailureHint } from "@mylanguagetutor/api-client/utils/recognitionFailureHint";
import { phaseAnnouncement } from "@mylanguagetutor/api-client/utils/phaseAnnouncement";
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
    speakAll: synthesis.speakAll,
  });
  const recognition = useSpeechRecognition(language.stt_locale, session.send);
  const micRechecks = useMicrophonePermission(recognition.failure === "denied", recognition.clearFailure);
  const [privacyAcked, setPrivacyAcked] = useState(hasAckedVoicePrivacy);
  const [completeDismissed, setCompleteDismissed] = useState(false);
  const textInput = useRef<HTMLInputElement>(null);
  const block = session.block;
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
    focusTypedAnswer: () => textInput.current?.focus(),
  });
  const busy = session.busy;
  const showComplete = session.scenarioState.complete && !completeDismissed;
  const announcements = practiceAnnouncements({
    spoken: phaseAnnouncement(voice.phase, voice.view) ?? latestReply(session.entries),
    failure: session.failure,
    recognitionHint: voice.view === "voice" ? recognitionFailureHint(recognition.failure) : null,
    block,
    notice: session.notice,
    scenarioComplete: showComplete,
  });

  return (
    <div className={PRACTICE_PAGE}>
      <PracticeAnnouncer messages={announcements} />
      <header className={PRACTICE_HEADER} data-testid={PRACTICE_SECTION_IDS.header}>
        <h1 className="text-xl font-semibold">{scenario.title}</h1>
        <p className="text-sm text-muted-foreground">{scenario.goal}</p>
        <ScenarioGoals goals={scenario.goals} met={session.scenarioState.goals_met} />
      </header>

      <div className={PRACTICE_TRANSCRIPT} data-testid={PRACTICE_SECTION_IDS.transcript}>
        {session.entries.length === 0 ? (
          <p className={PRACTICE_START_PROMPT}>
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
            onReplay={session.replay}
            onTryRetry={voice.tryRetry}
            onSkipRetry={session.dismissRetryPrompt}
          />
        )}
      </div>

      {showComplete && (
        <ScenarioCompleteBanner onKeepTalking={() => setCompleteDismissed(true)} />
      )}

      {session.failure && (
        <TurnErrorAlert failure={session.failure} onRetry={session.retry} onDismiss={session.dismissFailure} />
      )}

      {session.notice && <PracticeNoticeAlert notice={session.notice} onDismiss={session.dismissNotice} />}

      <div className={PRACTICE_COMPOSER} data-testid={PRACTICE_SECTION_IDS.composer}>
        {block && <SessionBlockNotice block={block} />}
        {voice.view === "denied" && <MicDeniedState rechecks={micRechecks} onTypeInstead={voice.switchToText} />}
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
              onSend={session.send}
              inputRef={textInput}
            />
            {!recognition.supported && (
              <p className="text-xs text-muted-foreground">{TYPING_ONLY_NOTE}</p>
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
