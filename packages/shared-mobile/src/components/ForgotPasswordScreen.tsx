import { useState } from "react";
import { Text } from "react-native";
import { requestPasswordReset } from "../auth/mobileAuthApi";
import { AUTH_FORM_COPY, FORGOT_PASSWORD_COPY } from "../constants/authForms";
import { FIELD_PRESETS } from "../constants/fieldPresets";
import { TURNSTILE_COPY } from "../constants/turnstile";
import { useAuthFormProblems } from "../hooks/useAuthFormProblems";
import { usePendingPress } from "../hooks/usePendingPress";
import { useTurnstileChallenge } from "../hooks/useTurnstileChallenge";
import { useTheme } from "../theme/useTheme";
import type { ForgotPasswordScreenProps } from "../types/ForgotPasswordScreenProps";
import AuthScreenFrame from "./AuthScreenFrame";
import AuthScreenHeading from "./AuthScreenHeading";
import Banner from "./Banner";
import EmailSentNotice from "./EmailSentNotice";
import FormField from "./FormField";
import InAppLink from "./InAppLink";
import LoadingButton from "./LoadingButton";
import TurnstileChallenge from "./TurnstileChallenge";

/**
 * Asks for a password-reset email, as the website's forgot-password page does. The backend answers the same for every
 * address, so the "Check your inbox" that follows never says whether one is registered. The emailed link opens the
 * website, where the new password is set.
 */
export default function ForgotPasswordScreen({ appName, webBaseUrl, turnstileSiteKey, onSignIn }: ForgotPasswordScreenProps) {
  const { colors, fontSize } = useTheme();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const turnstile = useTurnstileChallenge(turnstileSiteKey, webBaseUrl);
  const problems = useAuthFormProblems(appName, FORGOT_PASSWORD_COPY.unavailable, turnstile);
  const send = usePendingPress(submit);

  async function submit(): Promise<void> {
    const trimmedEmail = email.trim();
    problems.clear();
    if (!trimmedEmail) problems.setEmailError(AUTH_FORM_COPY.emailRequired);
    if (!turnstile.isReady) turnstile.showProblem(TURNSTILE_COPY.required);
    if (!trimmedEmail || !turnstile.isReady) return;

    const result = await requestPasswordReset(trimmedEmail, turnstile.token);
    if (result.outcome === "sent") setSentTo(trimmedEmail);
    else problems.show(result.failure);
  }

  return (
    <AuthScreenFrame>
      {sentTo !== null ? (
        <EmailSentNotice
          appName={appName}
          message={FORGOT_PASSWORD_COPY.sent(sentTo)}
          note={FORGOT_PASSWORD_COPY.opensOnWebsite}
          onSignIn={onSignIn}
        />
      ) : (
        <>
          <AuthScreenHeading appName={appName} title={FORGOT_PASSWORD_COPY.title} />
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{FORGOT_PASSWORD_COPY.intro}</Text>
          <FormField
            {...FIELD_PRESETS.ownEmail}
            error={problems.emailError}
            label="Email"
            onChangeText={setEmail}
            returnKeyType="done"
            value={email}
          />
          <TurnstileChallenge {...turnstile.challengeProps} />
          {problems.formError ? <Banner message={problems.formError} /> : null}
          <LoadingButton isLoading={send.isPending} loadingText={FORGOT_PASSWORD_COPY.submitting} onPress={send.press}>
            {FORGOT_PASSWORD_COPY.submit}
          </LoadingButton>
          <InAppLink label={AUTH_FORM_COPY.backToSignIn} onPress={onSignIn} />
        </>
      )}
    </AuthScreenFrame>
  );
}
