import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import AppLayout from "../app/(app)/_layout";
import TabsLayout from "../app/(app)/(tabs)/_layout";
import Practice from "../app/(app)/(tabs)/index";
import Settings from "../app/(app)/(tabs)/settings";
import DeleteAccountRoute from "../app/(app)/delete-account";
import SignInRoute from "../app/sign-in";

/** The app's own layouts and screens, as expo-router would find them under app/. */
export const APP_ROUTES = {
  _layout: RootLayout,
  "sign-in": SignInRoute,
  "(app)/_layout": AppLayout,
  "(app)/delete-account": DeleteAccountRoute,
  "(app)/(tabs)/_layout": TabsLayout,
  "(app)/(tabs)/index": Practice,
  "(app)/(tabs)/settings": Settings,
};

export function renderApp(initialUrl = "/") {
  return renderRouter(APP_ROUTES, { initialUrl });
}
