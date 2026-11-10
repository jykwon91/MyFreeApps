import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import AppLayout from "../app/(app)/_layout";
import TabsLayout from "../app/(app)/(tabs)/_layout";
import Applications from "../app/(app)/(tabs)/applications";
import Dashboard from "../app/(app)/(tabs)/index";
import More from "../app/(app)/(tabs)/more";
import Profile from "../app/(app)/(tabs)/profile";
import ApplicationRoute from "../app/(app)/applications/[id]";
import DeleteAccountRoute from "../app/(app)/delete-account";
import SignInRoute from "../app/sign-in";

/** The app's own layouts and screens, as expo-router would find them under app/. */
export const APP_ROUTES = {
  _layout: RootLayout,
  "sign-in": SignInRoute,
  "(app)/_layout": AppLayout,
  "(app)/applications/[id]": ApplicationRoute,
  "(app)/delete-account": DeleteAccountRoute,
  "(app)/(tabs)/_layout": TabsLayout,
  "(app)/(tabs)/index": Dashboard,
  "(app)/(tabs)/applications": Applications,
  "(app)/(tabs)/profile": Profile,
  "(app)/(tabs)/more": More,
};

export function renderApp(initialUrl = "/") {
  return renderRouter(APP_ROUTES, { initialUrl });
}
