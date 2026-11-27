import { ForgotPasswordScreen } from "@platform/mobile/captcha";
import { useRouter } from "expo-router";
import { TURNSTILE_SITE_KEY, WEB_BASE_URL } from "../src/constants/api";
import { APP_NAME } from "../src/constants/app";

export default function ForgotPasswordRoute() {
  const router = useRouter();
  return (
    <ForgotPasswordScreen
      appName={APP_NAME}
      onSignIn={() => router.dismissTo("/sign-in")}
      turnstileSiteKey={TURNSTILE_SITE_KEY}
      webBaseUrl={WEB_BASE_URL}
    />
  );
}
