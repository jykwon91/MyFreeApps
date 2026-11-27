import { DISPLAY_NAME_MAX_LENGTH } from "@platform/core/constants/displayName";
import { useState } from "react";
import { View } from "react-native";
import { requestRegister } from "../auth/mobileAuthApi";
import { AUTH_FORM_COPY, PASSWORD_MIN_LENGTH, REGISTER_COPY } from "../constants/authForms";
import { FIELD_PRESETS } from "../constants/fieldPresets";
import { TURNSTILE_COPY } from "../constants/turnstile";
import { useAuthFormProblems } from "../hooks/useAuthFormProblems";
import { useFieldChain } from "../hooks/useFieldChain";
import { usePendingPress } from "../hooks/usePendingPress";
import { useTurnstileChallenge } from "../hooks/useTurnstileChallenge";
import type { RegisterScreenProps } from "../types/RegisterScreenProps";
import AuthScreenFrame from "./AuthScreenFrame";
import AuthScreenHeading from "./AuthScreenHeading";
import Banner from "./Banner";
import EmailSentNotice from "./EmailSentNotice";
import FieldError from "./FieldError";
import FormField from "./FormField";
import InAppLink from "./InAppLink";
import LoadingButton from "./LoadingButton";
import PasswordVisibilityToggle from "./PasswordVisibilityToggle";
import SwitchRow from "./SwitchRow";
import TurnstileChallenge from "./TurnstileChallenge";

/**
 * Sign-up, as on the website: an optional name, email, password, the agreement and the captcha. It doesn't sign the
 * person in: the backend emails a verification link, so it ends on "Check your inbox" and the way back to sign-in,
 * which can resend that email.
 */
export default function RegisterScreen({ appName, webBaseUrl, turnstileSiteKey, nameField = "display_name", onSignIn }: RegisterScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();
  const [agreementError, setAgreementError] = useState<string>();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const turnstile = useTurnstileChallenge(turnstileSiteKey, webBaseUrl);
  const problems = useAuthFormProblems(appName, REGISTER_COPY.unavailable, turnstile);
  const register = usePendingPress(submit);
  // Return on the password closes the keyboard: the agreement and the captcha come before the button.
  const fields = useFieldChain(["name", "email", "password"]);

  async function submit(): Promise<void> {
    const trimmedEmail = email.trim();
    const nextEmailError = trimmedEmail ? undefined : AUTH_FORM_COPY.emailRequired;
    const nextPasswordError = password.length >= PASSWORD_MIN_LENGTH ? undefined : REGISTER_COPY.passwordTooShort;
    const nextAgreementError = hasAgreed ? undefined : REGISTER_COPY.agreementRequired;
    problems.clear();
    problems.setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setAgreementError(nextAgreementError);
    if (!turnstile.isReady) turnstile.showProblem(TURNSTILE_COPY.required);
    if (nextEmailError || nextPasswordError || nextAgreementError || !turnstile.isReady) return;

    const result = await requestRegister({ email: trimmedEmail, password, name, nameField }, turnstile.token);
    if (result.outcome === "registered") {
      setRegisteredEmail(trimmedEmail);
    } else if (result.outcome === "weakPassword") {
      turnstile.reset();
      setPasswordError(result.reason);
      fields.focus("password");
    } else if (result.failure === "email_taken") {
      turnstile.reset();
      problems.setEmailError(REGISTER_COPY.emailTaken);
      fields.focus("email");
    } else {
      problems.show(result.failure);
    }
  }

  function changeAgreement(next: boolean): void {
    setHasAgreed(next);
    if (next) setAgreementError(undefined);
  }

  return (
    <AuthScreenFrame>
      {registeredEmail !== null ? (
        <EmailSentNotice appName={appName} message={REGISTER_COPY.sent(registeredEmail)} onSignIn={onSignIn} />
      ) : (
        <>
          <AuthScreenHeading appName={appName} title={REGISTER_COPY.title} />
          <FormField
            {...FIELD_PRESETS.ownName}
            {...fields.field("name")}
            hint={REGISTER_COPY.nameHint}
            label={REGISTER_COPY.nameLabel}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            onChangeText={setName}
            value={name}
          />
          <FormField
            {...FIELD_PRESETS.ownEmail}
            {...fields.field("email")}
            error={problems.emailError}
            label="Email"
            onChangeText={setEmail}
            textContentType="username"
            value={email}
          />
          <FormField
            {...fields.field("password")}
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            error={passwordError}
            hint={REGISTER_COPY.passwordHint}
            label="Password"
            onChangeText={setPassword}
            secureTextEntry={!isPasswordVisible}
            textContentType="newPassword"
            trailing={<PasswordVisibilityToggle isVisible={isPasswordVisible} onToggle={() => setIsPasswordVisible((current) => !current)} />}
            value={password}
          />
          <View>
            <SwitchRow label={REGISTER_COPY.agreement} onValueChange={changeAgreement} value={hasAgreed} />
            <FieldError message={agreementError} name={REGISTER_COPY.agreement} />
          </View>
          <TurnstileChallenge {...turnstile.challengeProps} />
          {problems.formError ? <Banner message={problems.formError} /> : null}
          <LoadingButton isLoading={register.isPending} loadingText={REGISTER_COPY.submitting} onPress={register.press}>
            {REGISTER_COPY.submit}
          </LoadingButton>
          <InAppLink label={REGISTER_COPY.haveAccount} onPress={onSignIn} />
        </>
      )}
    </AuthScreenFrame>
  );
}
