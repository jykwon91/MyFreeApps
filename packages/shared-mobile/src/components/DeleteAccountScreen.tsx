import { useState } from "react";
import { Text, View } from "react-native";
import { fetchDevices, requestDeleteAccount } from "../auth/mobileAuthApi";
import { useFieldChain } from "../hooks/useFieldChain";
import { useSecondFactorCode } from "../hooks/useSecondFactorCode";
import { useSession } from "../hooks/useSession";
import { useTwoStepStatus } from "../hooks/useTwoStepStatus";
import { FIELD_PRESETS } from "../constants/fieldPresets";
import { SECURITY_MESSAGES } from "../constants/security";
import { useTheme } from "../theme/useTheme";
import Banner from "./Banner";
import FormField from "./FormField";
import KeyboardAwareScroll from "./KeyboardAwareScroll";
import LoadingButton from "./LoadingButton";
import LoadingRegion from "./LoadingRegion";
import SecondFactorCodeField from "./SecondFactorCodeField";
import Skeleton from "./Skeleton";

const NOT_DELETED = "Your account wasn't deleted.";
const UNCONFIRMED = "We couldn't confirm whether your account was deleted. Check again once you're connected.";

type FieldErrors = { email?: string; password?: string; code?: string };

/** `warning` says what this app's account holds, since that differs between apps. */
export default function DeleteAccountScreen({ warning }: { warning: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { session, state } = useSession();
  const twoFactor = useTwoStepStatus();
  const secondFactor = useSecondFactorCode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [needsCode, setNeedsCode] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [isUnconfirmed, setIsUnconfirmed] = useState(false);
  const showsCode = twoFactor.enabled === true || needsCode;
  // Return on the last field never submits: this can't be undone, so it takes a press.
  const fields = useFieldChain(["email", "password", showsCode && "code"]);

  if (state.status !== "signedIn") return null;
  const accountEmail = state.email;

  const canSubmit =
    twoFactor.enabled !== null &&
    !isUnconfirmed &&
    email.trim().toLowerCase() === accountEmail.toLowerCase() &&
    password.length > 0 &&
    (!showsCode || secondFactor.isComplete);

  /** A deleted account's session stops working, and what's left of it shouldn't stay on this phone. */
  function leaveIfSessionEnded(): void {
    if (session.getState().status === "signedOut") session.accountDeleted("unconfirmed");
  }

  async function submit(): Promise<void> {
    setFieldErrors({});
    setBanner(null);
    const result = await requestDeleteAccount({
      email: email.trim(),
      password,
      code: showsCode ? secondFactor.code : null,
    });
    switch (result.outcome) {
      case "deleted":
        session.accountDeleted("confirmed");
        return;
      case "unknown":
        leaveIfSessionEnded();
        setIsUnconfirmed(true);
        return;
      case "refused":
        // The attempt used up the code.
        secondFactor.clear();
        setBanner(`${NOT_DELETED} ${result.message}`);
        return;
      case "wrong_password":
        setPassword("");
        setFieldErrors({ password: "That password isn't right." });
        fields.focus("password");
        return;
      case "email_mismatch":
        setFieldErrors({ email: "That isn't the email on this account." });
        fields.focus("email");
        return;
      case "code_required":
        setNeedsCode(true);
        setFieldErrors({ code: "Enter your code." });
        fields.focus("code");
        return;
      case "invalid_code":
        secondFactor.clear();
        setFieldErrors({ code: "That code didn't work. Enter a new one." });
        fields.focus("code");
        return;
      case "rate_limited":
        setBanner(`${NOT_DELETED} Too many attempts. Please try again later.`);
        return;
      case "failed":
        setBanner(`${NOT_DELETED} Please try again.`);
        return;
    }
  }

  async function checkAgain(): Promise<void> {
    try {
      await fetchDevices();
      secondFactor.clear();
      setIsUnconfirmed(false);
      setBanner(`${NOT_DELETED} You can try again.`);
    } catch {
      // Otherwise there's still no answer, so what's on screen is still true.
      leaveIfSessionEnded();
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScroll
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}>
          Delete your account
        </Text>
        <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{warning}</Text>
        <FormField
          {...FIELD_PRESETS.ownEmail}
          {...fields.field("email")}
          autoFocus
          error={fieldErrors.email}
          label="Type your email to confirm"
          onChangeText={setEmail}
          value={email}
        />
        <FormField
          {...fields.field("password")}
          autoCapitalize="none"
          autoComplete="current-password"
          autoCorrect={false}
          error={fieldErrors.password}
          label="Password"
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          value={password}
        />
        {showsCode ? <SecondFactorCodeField {...fields.target("code")} error={fieldErrors.code} secondFactor={secondFactor} /> : null}
        {twoFactor.enabled === null && twoFactor.failure === null ? (
          <LoadingRegion label={SECURITY_MESSAGES.loadingTwoStep}>
            <Skeleton height={48} testID="two-factor-skeleton" />
          </LoadingRegion>
        ) : null}
        {twoFactor.failure !== null ? (
          <View style={{ gap: spacing.sm }}>
            <Banner message="We couldn't check your account's security settings. Check your connection and try again." />
            <LoadingButton loadingText="Trying again..." onPress={twoFactor.reload} variant="secondary">
              Try again
            </LoadingButton>
          </View>
        ) : null}
        {banner ? <Banner message={banner} /> : null}
        {isUnconfirmed ? (
          <View style={{ gap: spacing.sm }}>
            <Banner message={UNCONFIRMED} />
            <LoadingButton loadingText="Checking..." onPress={checkAgain} variant="secondary">
              Check again
            </LoadingButton>
          </View>
        ) : (
          // The keyboard never submits: this can't be undone, so it takes a press.
          <LoadingButton disabled={!canSubmit} loadingText="Deleting..." onPress={submit} variant="destructive">
            Delete my account forever
          </LoadingButton>
        )}
      </KeyboardAwareScroll>
    </View>
  );
}
