import { RequiredSignInScreen } from "@platform/mobile";
import { WEB_BASE_URL } from "../src/constants/api";
import { APP_NAME } from "../src/constants/app";

export default function SignInRoute() {
  return <RequiredSignInScreen appName={APP_NAME} webBaseUrl={WEB_BASE_URL} />;
}
