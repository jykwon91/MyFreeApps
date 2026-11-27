// @platform/mobile/captcha — the screens that show Cloudflare's Turnstile captcha: sign-up and forgot-password.
//
// They're kept out of the main entry because they need react-native-webview, which looks up its native module as
// soon as it's imported: in the main entry, every app would have to ship it or die at launch. It's an optional
// peer, so an app that imports this entry lists react-native-webview in its own dependencies and rebuilds its
// development build (test_app_conformance.py checks both sides).

export { default as ForgotPasswordScreen } from "./src/components/ForgotPasswordScreen";
export { default as RegisterScreen } from "./src/components/RegisterScreen";
export { default as TurnstileChallenge } from "./src/components/TurnstileChallenge";
export { useTurnstileChallenge } from "./src/hooks/useTurnstileChallenge";

export type { ForgotPasswordScreenProps } from "./src/types/ForgotPasswordScreenProps";
export type { RegisterNameField } from "./src/types/RegisterNameField";
export type { RegisterScreenProps } from "./src/types/RegisterScreenProps";
export type { TurnstileChallengeHandle } from "./src/types/TurnstileChallengeHandle";
export type { TurnstileChallengeProps } from "./src/types/TurnstileChallengeProps";
export type { TurnstileChallengeState } from "./src/types/TurnstileChallengeState";
