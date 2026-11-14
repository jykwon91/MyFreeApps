import { useState } from "react";
import { View } from "react-native";
import { resendVerificationEmail } from "../auth/mobileAuthApi";
import { RESEND_VERIFICATION_COPY } from "../constants/resendVerification";
import { useTheme } from "../theme/useTheme";
import type { ResendVerificationEmailProps } from "../types/ResendVerificationEmailProps";
import type { ResendVerificationOutcome } from "../types/ResendVerificationOutcome";
import Banner from "./Banner";
import LoadingButton from "./LoadingButton";

const ERROR_MESSAGES: Record<Exclude<ResendVerificationOutcome, "sent">, string> = {
  rate_limited: RESEND_VERIFICATION_COPY.rateLimited,
  failed: RESEND_VERIFICATION_COPY.failed,
};

/** Offered when sign-in fails because the email isn't verified yet. */
export default function ResendVerificationEmail({ email }: ResendVerificationEmailProps) {
  const { spacing } = useTheme();
  const [outcome, setOutcome] = useState<ResendVerificationOutcome | null>(null);

  async function resend(): Promise<void> {
    setOutcome(null);
    setOutcome(await resendVerificationEmail(email));
  }

  if (outcome === "sent") return <Banner message={RESEND_VERIFICATION_COPY.sent} tone="success" />;

  return (
    <View style={{ gap: spacing.md }}>
      {outcome ? <Banner message={ERROR_MESSAGES[outcome]} /> : null}
      <LoadingButton loadingText={RESEND_VERIFICATION_COPY.loading} onPress={resend} variant="secondary">
        {RESEND_VERIFICATION_COPY.label}
      </LoadingButton>
    </View>
  );
}
