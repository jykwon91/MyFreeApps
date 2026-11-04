import { Text, View } from "react-native";
import { useSession } from "../hooks/useSession";
import { useTheme } from "../theme/useTheme";
import LoadingButton from "./LoadingButton";

/** The saved sign-in can't be read right now, which doesn't mean it's gone. */
export default function UnreadableSession({ onSignInInstead }: { onSignInInstead?: () => void }) {
  const { session } = useSession();
  const { colors, fontSize, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "700" }}>
        Can't open your account yet
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        Your phone may still be locked or busy. You haven't been signed out.
      </Text>
      <LoadingButton loadingText="Trying again..." onPress={session.retryRestore}>
        Try again
      </LoadingButton>
      <LoadingButton
        onPress={() => {
          session.skipRestore();
          onSignInInstead?.();
        }}
        variant="ghost"
      >
        Sign in with your password
      </LoadingButton>
    </View>
  );
}
