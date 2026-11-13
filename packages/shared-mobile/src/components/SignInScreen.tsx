import { type ComponentRef, useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signInFailureMessage } from "../auth/signInFailureMessage";
import { useSession } from "../hooks/useSession";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { SignInFailure } from "../types/SignInFailure";
import type { SignInResult } from "../types/SignInResult";
import type { SignInScreenProps } from "../types/SignInScreenProps";
import Banner from "./Banner";
import FormField from "./FormField";
import KeyboardAwareScroll from "./KeyboardAwareScroll";
import LoadingButton from "./LoadingButton";
import SecondFactorForm from "./SecondFactorForm";
import ToastProvider from "./ToastProvider";
import WebLink from "./WebLink";

export default function SignInScreen({ appName, webBaseUrl, onSignedIn }: SignInScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { session, state } = useSession();
  const [email, setEmail] = useState(state.status === "signedOut" ? (state.lastEmail ?? "") : "");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const { bottom } = useSafeAreaInsets();

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
      passwordInput.current?.focus();
    } else {
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

  // Its own toasts, as sign-in shows before the app's screens and, as a modal, above them.
  return (
    <ToastProvider bottomOffset={bottom + spacing.lg}>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScroll
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          style={{ backgroundColor: colors.background }}
        >
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
              <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{appName}</Text>
              <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}>
                Sign in
              </Text>
              <FormField
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                error={emailError}
                keyboardType="email-address"
                label="Email"
                onChangeText={setEmail}
                onSubmitEditing={() => passwordInput.current?.focus()}
                returnKeyType="next"
                submitBehavior="submit"
                textContentType="username"
                value={email}
              />
              <FormField
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                error={passwordError}
                label="Password"
                onChangeText={setPassword}
                onSubmitEditing={() => void submitCredentials()}
                ref={passwordInput}
                returnKeyType="go"
                secureTextEntry={!isPasswordVisible}
                textContentType="password"
                trailing={
                  <Pressable
                    accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
                    accessibilityRole="button"
                    onPress={() => setIsPasswordVisible((current) => !current)}
                    style={{
                      minHeight: MIN_TOUCH_TARGET,
                      minWidth: MIN_TOUCH_TARGET,
                      paddingHorizontal: spacing.sm,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: colors.primary, fontSize: fontSize.sm }}>
                      {isPasswordVisible ? "Hide" : "Show"}
                    </Text>
                  </Pressable>
                }
                value={password}
              />
              {failure ? <Banner message={signInFailureMessage(failure, appName)} /> : null}
              <LoadingButton loadingText="Signing in..." onPress={submitCredentials}>
                Sign in
              </LoadingButton>
              <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
                You'll stay signed in on this phone until you sign out.
              </Text>
              <View>
                <WebLink label="Forgot your password? Reset it on the website" webPath="/forgot-password" webBaseUrl={webBaseUrl} />
                <WebLink label="New here? Create an account on the website" webPath="/register" webBaseUrl={webBaseUrl} />
              </View>
            </>
          )}
        </KeyboardAwareScroll>
      </View>
    </ToastProvider>
  );
}
