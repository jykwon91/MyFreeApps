import { LoadingButton, Skeleton, UnreadableSession, useSession, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { NEW_RECIPE_MESSAGES } from "../../constants/newRecipe";
import type { SignInPromptProps } from "../../types/SignInPromptProps";

/**
 * In place of a screen that writes to the account, while nobody is signed in: as the website does,
 * it asks a signed-out visitor to sign in, and signing in comes back to the screen.
 */
export default function SignInPrompt({ heading, body, skeletonTestID }: SignInPromptProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { state } = useSession();
  const router = useRouter();

  return (
    <View style={{ flex: 1, gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.background }}>
      {state.status === "restoring" ? <Skeleton height={120} testID={skeletonTestID} /> : null}
      {state.status === "unreadable" ? <UnreadableSession onSignInInstead={() => router.push("/sign-in")} /> : null}
      {state.status === "signedOut" ? (
        <>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "700" }}>
            {heading}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{body}</Text>
          <LoadingButton onPress={() => router.push("/sign-in")}>{NEW_RECIPE_MESSAGES.signIn}</LoadingButton>
        </>
      ) : null}
    </View>
  );
}
