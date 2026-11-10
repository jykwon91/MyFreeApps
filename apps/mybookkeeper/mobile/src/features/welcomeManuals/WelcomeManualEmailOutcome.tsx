import type { WelcomeManualSendResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-send-response";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { WELCOME_MANUAL_EMAIL_MESSAGES as MESSAGES, emailOutcomeCopy } from "../../constants/welcomeManualForms";
import { goBackOr } from "../../lib/goBackOr";

interface WelcomeManualEmailOutcomeProps {
  manualId: string;
  outcome: WelcomeManualSendResponse;
  /** Back to the form with what was typed still in it. */
  onTryAgain: () => void;
  onSendAnother: () => void;
}

/** What happened to the email: sent, refused by the mail server, or not sent because email isn't set up. */
export default function WelcomeManualEmailOutcome({ manualId, outcome, onTryAgain, onSendAnother }: WelcomeManualEmailOutcomeProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { heading, body } = emailOutcomeCopy(outcome);
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: spacing.md, padding: spacing.lg }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>{heading}</Text>
      <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{body}</Text>
      {outcome.status === "sent" ? (
        <LoadingButton onPress={onSendAnother} variant="secondary">{MESSAGES.sendAnother}</LoadingButton>
      ) : (
        <LoadingButton onPress={onTryAgain} variant="secondary">{MESSAGES.tryAgain}</LoadingButton>
      )}
      <LoadingButton onPress={() => goBackOr(`/welcome-manuals/${manualId}`)}>{MESSAGES.done}</LoadingButton>
    </View>
  );
}
