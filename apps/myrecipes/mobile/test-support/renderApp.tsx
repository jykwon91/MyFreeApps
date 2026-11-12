import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import TabsLayout from "../app/(tabs)/_layout";
import Discover from "../app/(tabs)/discover";
import Recipes from "../app/(tabs)/index";
import Settings from "../app/(tabs)/settings";
import DeleteAccountRoute from "../app/delete-account";
import SecurityRoute from "../app/security/index";
import SecurityTurnOnRoute from "../app/security/turn-on";
import SignInRoute from "../app/sign-in";

/** The app's layouts and its account screens, as expo-router would find them under app/. The recipe and cook screens have tests of their own. */
export const APP_ROUTES = {
  _layout: RootLayout,
  "sign-in": SignInRoute,
  "delete-account": DeleteAccountRoute,
  "security/index": SecurityRoute,
  "security/turn-on": SecurityTurnOnRoute,
  "(tabs)/_layout": TabsLayout,
  "(tabs)/index": Recipes,
  "(tabs)/discover": Discover,
  "(tabs)/settings": Settings,
};

export function renderApp(initialUrl = "/") {
  return renderRouter(APP_ROUTES, { initialUrl });
}
