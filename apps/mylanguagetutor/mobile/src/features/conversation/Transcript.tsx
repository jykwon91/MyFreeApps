import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { TranscriptProps } from "../../types/TranscriptProps";
import TranscriptItem from "./TranscriptItem";
import TypingDots from "./TypingDots";

/** The conversation so far. */
export default function Transcript({ entries, languageName, waiting, busy, canReplay, onReplay, onTryRetry, onSkipRetry }: TranscriptProps) {
  const { spacing } = useTheme();
  const last = entries[entries.length - 1];
  return (
    <View style={{ gap: spacing.lg }} testID="transcript">
      {entries.map((entry) => (
        <TranscriptItem
          busy={busy}
          canReplay={canReplay}
          entry={entry}
          key={entry.key}
          languageName={languageName}
          onReplay={onReplay}
          onSkipRetry={onSkipRetry}
          onTryRetry={onTryRetry}
          showRetryPrompt={entry === last}
        />
      ))}
      {waiting ? <TypingDots /> : null}
    </View>
  );
}
