import { RequiredSignInScreen } from "@platform/mobile";
import { WEB_BASE_URL } from "../src/constants/api";

export default function SignInRoute() {
  return <RequiredSignInScreen appName={"__APP_DISPLAY_NAME__"} webBaseUrl={WEB_BASE_URL} />;
}
