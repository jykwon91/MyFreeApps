import type { StyleProp, ViewStyle } from "react-native";
import { useSession } from "../hooks/useSession";
import Banner from "./Banner";

interface SessionEndedBannerProps {
  onSignIn: () => void;
  style?: StyleProp<ViewStyle>;
}

/** The server doesn't say why a session ended, so this doesn't guess. */
export default function SessionEndedBanner({ onSignIn, style }: SessionEndedBannerProps) {
  const { session, state } = useSession();
  if (state.status !== "signedOut" || !state.endedByServer) return null;

  return (
    <Banner
      actions={[
        { label: "Sign in", onPress: onSignIn },
        { label: "Not now", onPress: session.dismissEndedNotice },
      ]}
      message="You've been signed out on this device. Sign in again to continue."
      style={style}
    />
  );
}
