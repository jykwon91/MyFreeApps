import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../hooks/useSession";
import { useTheme } from "../theme/useTheme";
import AccountDeletedBanner from "./AccountDeletedBanner";
import Banner from "./Banner";
import SignInScreen from "./SignInScreen";

/** Sign-in for an app that can't be used without it, so there's nothing to cancel back to. */
export default function RequiredSignInScreen({ appName, webBaseUrl }: { appName: string; webBaseUrl: string }) {
  const { state } = useSession();
  const { colors, spacing } = useTheme();
  const { top } = useSafeAreaInsets();
  const wasEnded = state.status === "signedOut" && state.endedByServer;
  return (
    <View style={{ flex: 1, paddingTop: top, backgroundColor: colors.background }}>
      {wasEnded ? (
        <Banner
          message="You've been signed out on this device. Sign in again to continue."
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}
        />
      ) : null}
      <AccountDeletedBanner style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }} />
      <SignInScreen appName={appName} webBaseUrl={webBaseUrl} />
    </View>
  );
}
