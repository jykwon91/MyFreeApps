import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { usePracticeSession } from "@mylanguagetutor/api-client/hooks/usePracticeSession";
import { useGetUsageTodayQuery } from "@mylanguagetutor/api-client/store/usageApi";
import { startConversationPrompt } from "@mylanguagetutor/api-client/utils/startConversationPrompt";
import { typedAnswerPlaceholder } from "@mylanguagetutor/api-client/utils/typedAnswerPlaceholder";
import { usageBlock } from "@mylanguagetutor/api-client/utils/usageBlock";
import { useAnnouncement, useTheme } from "@platform/mobile";
import { useHeaderHeight } from "expo-router/react-navigation";
import { type ComponentRef, useRef, useState } from "react";
import { KeyboardAvoidingView, type NativeScrollEvent, type NativeSyntheticEvent, Platform, ScrollView, Text, type TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CORRECTIONS_GRACE_MS } from "../../constants/conversation";
import { useAwakeUntilIdle } from "../../hooks/useAwakeUntilIdle";
import { useOnBackground } from "../../hooks/useOnBackground";
import { useOnResume } from "../../hooks/useOnResume";
import { useStickToBottom } from "../../hooks/useStickToBottom";
import { NO_SPEECH } from "../../lib/noSpeech";
import { streamTurn } from "../../lib/streamTurn";
import type { ConversationProps } from "../../types/ConversationProps";
import { latestReply } from "../../utils/latestReply";
import ConversationHeader from "./ConversationHeader";
import KeepAwake from "./KeepAwake";
import ScenarioCompleteBanner from "./ScenarioCompleteBanner";
import SessionBlockNotice from "./SessionBlockNotice";
import Transcript from "./Transcript";
import TurnErrorBanner from "./TurnErrorBanner";
import TypedComposer from "./TypedComposer";

/**
 * A typed conversation in one scenario, as the website's practice page runs it: send, read the reply
 * as it streams, see corrections, answer again. Going to the background stops a reply mid-stream as a
 * dropped connection would, and the learner tries again from there, as on the website; a reply that
 * has fully arrived is left to finish, though not waited on for long after the app comes back. The
 * screen stays awake while the learner can answer, until they've been idle a while.
 */
export default function Conversation({ language, scenario, level }: ConversationProps) {
  const { colors, spacing, fontSize } = useTheme();
  const session = usePracticeSession({
    languageCode: language.code,
    ttsLocale: language.tts_locale,
    scenarioSlug: scenario.slug,
    level,
    streamTurn,
    speak: NO_SPEECH.speak,
    stopSpeaking: NO_SPEECH.stopSpeaking,
  });
  const usage = useGetUsageTodayQuery();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [completeDismissed, setCompleteDismissed] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const { scroller, onScroll, onContentSizeChange, onLayout, stick } = useStickToBottom();
  useOnBackground(session.interrupt);
  useOnResume(session.stopWaitingForCorrections, CORRECTIONS_GRACE_MS);
  useAnnouncement(latestReply(session.entries), "polite");

  const busy = session.requestPhase !== "idle";
  const block = session.block ?? usageBlock(usage.data);
  const { awake, onActivity } = useAwakeUntilIdle(busy);

  const scroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScroll(event);
    onActivity();
  };

  const send = (text: string) => {
    stick();
    session.send(text);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
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
            entries={session.entries}
            languageName={language.display_name}
            onSkipRetry={session.dismissRetryPrompt}
            onTryRetry={() => input.current?.focus()}
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
          <TypedComposer
            onActivity={onActivity}
            busy={busy}
            inputRef={input}
            label={PRACTICE_COPY.typingOnlyLabel}
            onSend={send}
            placeholder={typedAnswerPlaceholder(language.display_name)}
          />
        )}
      </View>
      {awake && !block ? <KeepAwake /> : null}
    </KeyboardAvoidingView>
  );
}
