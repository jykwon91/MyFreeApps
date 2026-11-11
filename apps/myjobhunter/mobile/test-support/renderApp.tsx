import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import AppLayout from "../app/(app)/_layout";
import AnalyzeRoute from "../app/(app)/analyze";
import TabsLayout from "../app/(app)/(tabs)/_layout";
import Applications from "../app/(app)/(tabs)/applications";
import Dashboard from "../app/(app)/(tabs)/index";
import More from "../app/(app)/(tabs)/more";
import Profile from "../app/(app)/(tabs)/profile";
import ApplicationRoute from "../app/(app)/applications/[id]";
import AddApplicationRoute from "../app/(app)/applications/new";
import CompanyRoute from "../app/(app)/companies/[id]";
import CompaniesRoute from "../app/(app)/companies/index";
import DeleteAccountRoute from "../app/(app)/delete-account";
import DiscoverRoute from "../app/(app)/discover";
import DocumentsRoute from "../app/(app)/documents";
import SignInRoute from "../app/sign-in";

/** The app's own layouts and screens, as expo-router would find them under app/. */
export const APP_ROUTES = {
  _layout: RootLayout,
  "sign-in": SignInRoute,
  "(app)/_layout": AppLayout,
  "(app)/analyze": AnalyzeRoute,
  "(app)/applications/[id]": ApplicationRoute,
  "(app)/applications/new": AddApplicationRoute,
  "(app)/companies/[id]": CompanyRoute,
  "(app)/companies/index": CompaniesRoute,
  "(app)/delete-account": DeleteAccountRoute,
  "(app)/discover": DiscoverRoute,
  "(app)/documents": DocumentsRoute,
  "(app)/(tabs)/_layout": TabsLayout,
  "(app)/(tabs)/index": Dashboard,
  "(app)/(tabs)/applications": Applications,
  "(app)/(tabs)/profile": Profile,
  "(app)/(tabs)/more": More,
};

export function renderApp(initialUrl = "/") {
  return renderRouter(APP_ROUTES, { initialUrl });
}
