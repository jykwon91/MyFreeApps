import type { StyleProp, ViewStyle } from "react-native";
import { useSession } from "../hooks/useSession";
import Banner from "./Banner";

export default function AccountDeletedBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { session, state } = useSession();
  if (state.status !== "signedOut" || !state.accountDeleted) return null;

  return (
    <Banner
      actions={[{ label: "OK", onPress: session.dismissEndedNotice }]}
      message={
        state.accountDeleted === "confirmed"
          ? "Your account has been deleted."
          : "You've been signed out. Your account was probably deleted. If it wasn't, you can sign in again."
      }
      style={style}
      tone="success"
    />
  );
}
