import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import ForgotPasswordRoute from "../app/forgot-password";
import RegisterRoute from "../app/register";
import SignInRoute from "../app/sign-in";

/** The app's root layout and the screens before signing in, as expo-router would find them under app/. */
export const SIGNED_OUT_ROUTES = {
  _layout: RootLayout,
  "sign-in": SignInRoute,
  register: RegisterRoute,
  "forgot-password": ForgotPasswordRoute,
  // The signed-in group, which these tests never reach.
  "(app)/_layout": () => null,
};

export function renderSignedOutApp(initialUrl = "/sign-in") {
  return renderRouter(SIGNED_OUT_ROUTES, { initialUrl });
}
