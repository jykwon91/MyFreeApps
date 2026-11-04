import { SessionEndedBanner, useSession, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AccountNotice() {
  const { state } = useSession();
  const { spacing } = useTheme();
  const { top } = useSafeAreaInsets();
  const router = useRouter();
  if (state.status !== "signedOut" || !state.endedByServer) return null;

  return (
    // Over the screen rather than above it: the navigation header below would add its own
    // status bar space, leaving a gap.
    <View style={{ position: "absolute", top: top + spacing.xs, left: spacing.md, right: spacing.md, zIndex: 1 }}>
      <SessionEndedBanner onSignIn={() => router.push("/sign-in")} />
    </View>
  );
}
