import { useEffect, useRef, useState } from "react";
import { BackHandler, Text, View } from "react-native";
import { signInFailureMessage } from "../auth/signInFailureMessage";
import { SIGN_IN_LINKS } from "../constants/signInLinks";
import { useFieldChain } from "../hooks/useFieldChain";
import { usePendingPress } from "../hooks/usePendingPress";
import { useSession } from "../hooks/useSession";
import { useTheme } from "../theme/useTheme";
import type { SignInFailure } from "../types/SignInFailure";
import type { SignInResult } from "../types/SignInResult";
import type { SignInScreenProps } from "../types/SignInScreenProps";
import AuthScreenFrame from "./AuthScreenFrame";
import AuthScreenHeading from "./AuthScreenHeading";
import Banner from "./Banner";
import FormField from "./FormField";
import InAppLink from "./InAppLink";
import LoadingButton from "./LoadingButton";
import PasswordVisibilityToggle from "./PasswordVisibilityToggle";
import ResendVerificationEmail from "./ResendVerificationEmail";
import SecondFactorForm from "./SecondFactorForm";
import WebLink from "./WebLink";

export default function SignInScreen({
  appName,
  webBaseUrl,
  registration = "open",
  onSignedIn,
  onForgotPassword,
  onCreateAccount,
}: SignInScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { session, state } = useSession();
  const [email, setEmail] = useState(state.status === "signedOut" ? (state.lastEmail ?? "") : "");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  // One guard for Return and Sign in, so neither can sign in a second time while one is under way.
  const signIn = usePendingPress(submitCredentials);
  const fields = useFieldChain(["email", "password"], { onLast: signIn.press, isLastBlocked: signIn.isPending });

  // Also covers a link to this screen when already signed in. Waiting for the state means
  // there's one path out, so this can't close twice.
  const isSignedIn = state.status === "signedIn";
  const closeRef = useRef(onSignedIn);
  useEffect(() => {
    closeRef.current = onSignedIn;
  }, [onSignedIn]);
  useEffect(() => {
    if (isSignedIn) closeRef.current?.();
  }, [isSignedIn]);

  useEffect(() => {
    if (!needsCode) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setNeedsCode(false);
      return true;
    });
    return () => subscription.remove();
  }, [needsCode]);

  function showFailure(next: SignInFailure): void {
    if (next === "bad_credentials") {
      setPasswordError(signInFailureMessage(next, appName));
      fields.focus("password");
    } else {
      if (next === "not_verified") setUnverifiedEmail(email.trim());
      setFailure(next);
    }
  }

  async function attempt(totpCode?: string): Promise<SignInResult> {
    setEmailError(undefined);
    setPasswordError(undefined);
    setFailure(null);
    const result = await session.signIn({ email: email.trim(), password, totpCode });
    if (result.outcome === "signedIn") setPassword("");
    return result;
  }

  async function submitCredentials(): Promise<void> {
    const trimmedEmail = email.trim();
    const nextEmailError = trimmedEmail ? undefined : "Enter your email.";
    const nextPasswordError = password ? undefined : "Enter your password.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    const result = await attempt();
    if (result.outcome === "totpRequired") setNeedsCode(true);
    if (result.outcome === "failed") showFailure(result.failure);
  }

  return (
    <AuthScreenFrame>
      {needsCode ? (
        <SecondFactorForm
          appName={appName}
          onBack={() => setNeedsCode(false)}
          onCredentialsRejected={(rejection) => {
            setNeedsCode(false);
            showFailure(rejection);
          }}
          onSubmit={attempt}
        />
      ) : (
        <>
          <AuthScreenHeading appName={appName} title="Sign in" />
          <FormField
            {...fields.field("email")}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            error={emailError}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            textContentType="username"
            value={email}
          />
          <FormField
            {...fields.field("password")}
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            error={passwordError}
            label="Password"
            onChangeText={setPassword}
            secureTextEntry={!isPasswordVisible}
            textContentType="password"
            trailing={<PasswordVisibilityToggle isVisible={isPasswordVisible} onToggle={() => setIsPasswordVisible((current) => !current)} />}
            value={password}
          />
          {failure ? <Banner message={signInFailureMessage(failure, appName)} /> : null}
          {failure === "not_verified" ? <ResendVerificationEmail email={unverifiedEmail} /> : null}
          <LoadingButton isLoading={signIn.isPending} loadingText="Signing in..." onPress={signIn.press}>
            Sign in
          </LoadingButton>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
            You'll stay signed in on this phone until you sign out.
          </Text>
          <View>
            {onForgotPassword ? (
              <InAppLink label={SIGN_IN_LINKS.forgotPassword} onPress={onForgotPassword} />
            ) : (
              <WebLink label={SIGN_IN_LINKS.forgotPasswordOnWebsite} webPath="/forgot-password" webBaseUrl={webBaseUrl} />
            )}
            {registration === "invite_only" ? (
              <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, paddingVertical: spacing.sm }}>
                {appName} is invite-only. Use the link in your invite email to create an account.
              </Text>
            ) : onCreateAccount ? (
              <InAppLink label={SIGN_IN_LINKS.createAccount} onPress={onCreateAccount} />
            ) : (
              <WebLink label={SIGN_IN_LINKS.createAccountOnWebsite} webPath="/register" webBaseUrl={webBaseUrl} />
            )}
          </View>
        </>
      )}
    </AuthScreenFrame>
  );
}
