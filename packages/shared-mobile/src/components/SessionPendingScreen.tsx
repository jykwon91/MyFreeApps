import { View } from "react-native";
import { useSession } from "../hooks/useSession";
import { useTheme } from "../theme/useTheme";
import UnreadableSession from "./UnreadableSession";

/** For an app with nothing to show signed out, until it's known who this is. */
export default function SessionPendingScreen() {
  const { state } = useSession();
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.background }}>
      {state.status === "unreadable" ? <UnreadableSession /> : null}
    </View>
  );
}
