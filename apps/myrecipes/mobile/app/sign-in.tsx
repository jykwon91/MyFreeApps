import { MIN_TOUCH_TARGET, SignInScreen, useTheme } from "@platform/mobile";
import { Stack, useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { WEB_BASE_URL } from "../src/constants/api";

export default function SignInRoute() {
  const router = useRouter();
  const { colors, fontSize } = useTheme();

  function close(): void {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center" }}
            >
              <Text style={{ color: colors.primary, fontSize: fontSize.md }}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <SignInScreen appName="MyRecipes" onSignedIn={close} webBaseUrl={WEB_BASE_URL} />
    </>
  );
}
