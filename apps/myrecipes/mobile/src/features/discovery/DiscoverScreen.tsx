import { SessionPendingScreen, UnreadableSession, useSession, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { View } from "react-native";
import DiscoverSearch from "./DiscoverSearch";
import DiscoverSignedOut from "./DiscoverSignedOut";

/**
 * The Discover tab. Discovery spends a paid web search per query, so like the website's /discover
 * it needs an account; signed out, the tab explains that and offers sign-in in its place.
 */
export default function DiscoverScreen() {
  const { colors, spacing } = useTheme();
  const { state } = useSession();
  const router = useRouter();

  if (state.status === "restoring") return <SessionPendingScreen />;
  if (state.status === "signedIn") return <DiscoverSearch key={state.email} />;
  return (
    <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.background }}>
      {state.status === "unreadable" ? (
        <UnreadableSession onSignInInstead={() => router.push("/sign-in")} />
      ) : (
        <DiscoverSignedOut />
      )}
    </View>
  );
}
