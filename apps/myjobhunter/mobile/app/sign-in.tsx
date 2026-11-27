import { RequiredSignInScreen } from "@platform/mobile";
import { useRouter } from "expo-router";
import { WEB_BASE_URL } from "../src/constants/api";
import { APP_NAME } from "../src/constants/app";

export default function SignInRoute() {
  const router = useRouter();
  return (
    <RequiredSignInScreen
      appName={APP_NAME}
      onForgotPassword={() => router.push("/forgot-password")}
      registration="invite_only"
      webBaseUrl={WEB_BASE_URL}
    />
  );
}
