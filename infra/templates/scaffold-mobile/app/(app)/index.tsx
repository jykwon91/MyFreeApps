import { EmptyState, LoadingButton, useSession } from "@platform/mobile";
import { View } from "react-native";

export default function Home() {
  const { session } = useSession();

  async function signOut(): Promise<void> {
    await session.signOut();
  }

  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <EmptyState body="This screen is a placeholder." heading={"__APP_DISPLAY_NAME__"} />
      <LoadingButton loadingText="Signing out..." onPress={signOut} variant="ghost">
        Sign out
      </LoadingButton>
    </View>
  );
}
