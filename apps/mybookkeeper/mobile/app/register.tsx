import { RegisterScreen } from "@platform/mobile/captcha";
import { useRouter } from "expo-router";
import { TURNSTILE_SITE_KEY, WEB_BASE_URL } from "../src/constants/api";
import { APP_NAME } from "../src/constants/security";

export default function RegisterRoute() {
  const router = useRouter();
  return (
    <RegisterScreen
      appName={APP_NAME}
      nameField="name"
      onSignIn={() => router.dismissTo("/sign-in")}
      turnstileSiteKey={TURNSTILE_SITE_KEY}
      webBaseUrl={WEB_BASE_URL}
    />
  );
}
