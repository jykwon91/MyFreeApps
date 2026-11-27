import { RequiredSignInScreen } from "@platform/mobile";
import { useRouter } from "expo-router";
import { WEB_BASE_URL } from "../src/constants/api";
import { APP_NAME } from "../src/constants/security";

export default function SignInRoute() {
  const router = useRouter();
  return (
    <RequiredSignInScreen
      appName={APP_NAME}
      onCreateAccount={() => router.push("/register")}
      onForgotPassword={() => router.push("/forgot-password")}
      webBaseUrl={WEB_BASE_URL}
    />
  );
}
