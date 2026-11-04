import { RequiredSignInScreen } from "@platform/mobile";
import { WEB_BASE_URL } from "../src/constants/api";

export default function SignInRoute() {
  return <RequiredSignInScreen appName={"MyBookkeeper"} webBaseUrl={WEB_BASE_URL} />;
}
