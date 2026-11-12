import { LoadingButton, Skeleton, UnreadableSession, useSession, useTheme } from "@platform/mobile";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import NewRecipeForm from "./NewRecipeForm";
import NewRecipeFromDiscovery from "./NewRecipeFromDiscovery";

/**
 * Creating a recipe needs an account, as on the website, which asks a signed-out visitor to sign
 * in. Signing in comes back here, to the form. Opened with a `discovery` result id, the form is
 * filled in from that recipe for the user to review, as the website's editor is.
 */
export default function NewRecipeScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const { state } = useSession();
  const router = useRouter();
  const { discovery } = useLocalSearchParams<{ discovery?: string }>();

  // Keyed so another account starts with an empty form.
  if (state.status === "signedIn") {
    return discovery ? <NewRecipeFromDiscovery key={state.email} resultId={discovery} /> : <NewRecipeForm key={state.email} />;
  }

  return (
    <View style={{ flex: 1, gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.background }}>
      {state.status === "restoring" ? <Skeleton height={120} testID="new-recipe-skeleton" /> : null}
      {state.status === "unreadable" ? <UnreadableSession onSignInInstead={() => router.push("/sign-in")} /> : null}
      {state.status === "signedOut" ? (
        <>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "700" }}>
            {MESSAGES.signInHeading}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.signInBody}</Text>
          <LoadingButton onPress={() => router.push("/sign-in")}>{MESSAGES.signIn}</LoadingButton>
        </>
      ) : null}
    </View>
  );
}
