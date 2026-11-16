import { RequiredSignInScreen } from "@platform/mobile";
import { WEB_BASE_URL } from "../src/constants/api";
import { APP_NAME } from "../src/constants/app";

export default function SignInRoute() {
  return <RequiredSignInScreen appName={APP_NAME} registration="invite_only" webBaseUrl={WEB_BASE_URL} />;
}
