import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import AppLayout, { unstable_settings as appSettings } from "../app/(app)/_layout";
import TabsLayout from "../app/(app)/(tabs)/_layout";
import Practice from "../app/(app)/(tabs)/index";
import Settings from "../app/(app)/(tabs)/settings";
import DeleteAccountRoute from "../app/(app)/delete-account";
import OnboardingLanguageRoute from "../app/(app)/onboarding/language";
import OnboardingLevelRoute from "../app/(app)/onboarding/level";
import SignInRoute from "../app/sign-in";

/** The app's own layouts and screens, as expo-router would find them under app/. */
export const APP_ROUTES = {
  _layout: RootLayout,
  "sign-in": SignInRoute,
  "(app)/_layout": { default: AppLayout, unstable_settings: appSettings },
  "(app)/delete-account": DeleteAccountRoute,
  "(app)/onboarding/language": OnboardingLanguageRoute,
  "(app)/onboarding/level": OnboardingLevelRoute,
  "(app)/(tabs)/_layout": TabsLayout,
  "(app)/(tabs)/index": Practice,
  "(app)/(tabs)/settings": Settings,
};

export function renderApp(initialUrl = "/") {
  return renderRouter(APP_ROUTES, { initialUrl });
}
