import { usePracticeSession } from "@mylanguagetutor/api-client/hooks/usePracticeSession";
import { useVoiceInput } from "@mylanguagetutor/api-client/hooks/useVoiceInput";
import { useGetUsageTodayQuery } from "@mylanguagetutor/api-client/store/usageApi";
import { startConversationPrompt } from "@mylanguagetutor/api-client/utils/startConversationPrompt";
import { replayRate } from "@mylanguagetutor/api-client/utils/replayRate";
import { typedAnswerPlaceholder } from "@mylanguagetutor/api-client/utils/typedAnswerPlaceholder";
import { usageBlock } from "@mylanguagetutor/api-client/utils/usageBlock";
import { HeaderKeyboardAvoidingView, useAnnouncement, useTheme } from "@platform/mobile";
import { type ComponentRef, useRef, useState } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, Text, type TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CORRECTIONS_GRACE_MS } from "../../constants/conversation";
import { useAwakeUntilIdle } from "../../hooks/useAwakeUntilIdle";
import { useOnBackground } from "../../hooks/useOnBackground";
import { useOnDeviceRecognition } from "../../hooks/useOnDeviceRecognition";
import { useOnResume } from "../../hooks/useOnResume";
import { useSpeechInput } from "../../hooks/useSpeechInput";
import { useTutorVoice } from "../../hooks/useTutorVoice";
import { useStickToBottom } from "../../hooks/useStickToBottom";
import { useVoicePrivacy } from "../../hooks/useVoicePrivacy";
import { streamTurn } from "../../lib/streamTurn";
import type { ConversationProps } from "../../types/ConversationProps";
import { latestReply } from "../../utils/latestReply";
import { phaseAnnouncement } from "../../utils/phaseAnnouncement";
import { recognizerPrivacy } from "../../utils/recognizerPrivacy";
import Composer from "./Composer";
import ConversationHeader from "./ConversationHeader";
import KeepAwake from "./KeepAwake";
import ScenarioCompleteBanner from "./ScenarioCompleteBanner";
import SessionBlockNotice from "./SessionBlockNotice";
import Transcript from "./Transcript";
import TurnErrorBanner from "./TurnErrorBanner";

/**
 * A conversation in one scenario, as the website's practice page runs it: speak (or type) an answer,
 * read and hear the reply as it streams, see corrections, answer again. Speaking is tap to talk: the
 * phone stops listening once the learner goes quiet and sends what it heard; tapping the microphone
 * while the tutor speaks interrupts it. Screen readers are also told each finished
 * reply, as the website's live region tells them: TalkBack speaks on its own audio stream while the
 * tutor's voice plays as media, so a learner who has the media volume down still hears it. Going to the background stops a reply mid-stream as a
 * dropped connection would, and the learner tries again from there, as on the website; a reply that
 * has fully arrived is left to finish, though not waited on for long after the app comes back. The
 * screen stays awake while the learner can answer, until they've been idle a while. Speech stops on
 * a new turn, on leaving the screen and in the background, and listening stops there too, dropping what
 * was heard rather than sending half an answer.
 */
export default function Conversation({ language, scenario, level }: ConversationProps) {
  const { colors, spacing, fontSize } = useTheme();
  const synthesis = useTutorVoice(language.tts_locale);
  const session = usePracticeSession({
    languageCode: language.code,
    ttsLocale: language.tts_locale,
    scenarioSlug: scenario.slug,
    level,
    streamTurn,
    speak: synthesis.enqueue,
    stopSpeaking: synthesis.cancel,
  });
  const usage = useGetUsageTodayQuery();
  const insets = useSafeAreaInsets();
  const [completeDismissed, setCompleteDismissed] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const { scroller, onScroll, onContentSizeChange, onLayout, stick } = useStickToBottom();

  const send = (text: string) => {
    stick();
    session.send(text);
  };

  const onDevice = useOnDeviceRecognition(language.stt_locale);
  const recognition = useSpeechInput(language.stt_locale, onDevice, send);
  const privacy = recognizerPrivacy(onDevice);
  const privacyAck = useVoicePrivacy(privacy);
  const busy = session.requestPhase !== "idle";
  const block = session.block ?? usageBlock(usage.data);
  const voice = useVoiceInput({
    recognition,
    speaking: synthesis.speaking,
    stopSpeaking: synthesis.cancel,
    requestPhase: session.requestPhase,
    block,
    privacyAcked: privacyAck.acked === true,
    ackPrivacy: privacyAck.ack,
  });
  useOnBackground(recognition.abort);
  useOnBackground(session.interrupt);
  useOnBackground(synthesis.cancel);
  useOnResume(session.stopWaitingForCorrections, CORRECTIONS_GRACE_MS);
  useAnnouncement(latestReply(session.entries), "polite");
  useAnnouncement(phaseAnnouncement(voice.phase, voice.view), "polite");
  const { awake, onActivity } = useAwakeUntilIdle(busy || recognition.listening);

  const scroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScroll(event);
    onActivity();
  };

  const tryRetry = () => {
    if (voice.mode === "voice") voice.startListening();
    else input.current?.focus();
  };

  return (
    <HeaderKeyboardAvoidingView>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, gap: spacing.lg, padding: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
        onScroll={scroll}
        ref={scroller}
        scrollEventThrottle={16}
        testID="conversation"
      >
        <ConversationHeader goalsMet={session.scenarioState.goals_met} scenario={scenario} />
        {session.entries.length === 0 ? (
          <Text style={{ paddingVertical: spacing.xl, color: colors.mutedForeground, fontSize: fontSize.sm, textAlign: "center" }}>
            {startConversationPrompt(language.display_name)}
          </Text>
        ) : (
          <Transcript
            busy={busy}
            canReplay={voice.canReplay}
            entries={session.entries}
            languageName={language.display_name}
            onReplay={(text, slow) => synthesis.speakAll(text, replayRate(slow))}
            onSkipRetry={session.dismissRetryPrompt}
            onTryRetry={tryRetry}
            waiting={session.requestPhase === "waiting"}
          />
        )}
        {session.scenarioState.complete && !completeDismissed ? <ScenarioCompleteBanner onKeepTalking={() => setCompleteDismissed(true)} /> : null}
        {session.failure ? <TurnErrorBanner failure={session.failure} onDismiss={session.dismissFailure} onRetry={session.retry} /> : null}
      </ScrollView>
      <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, borderTopWidth: 1, borderColor: colors.border }}>
        {block ? (
          <SessionBlockNotice block={block} />
        ) : (
          <Composer
            busy={busy}
            inputRef={input}
            onActivity={onActivity}
            onSend={send}
            placeholder={typedAnswerPlaceholder(language.display_name)}
            privacy={privacyAck.acked === null ? null : privacy}
            recognition={recognition}
            voice={voice}
          />
        )}
      </View>
      {awake && !block ? <KeepAwake /> : null}
    </HeaderKeyboardAvoidingView>
  );
}
