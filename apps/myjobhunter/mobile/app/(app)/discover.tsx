import { Stack } from "expo-router";
import { DISCOVER_SCREEN_MESSAGES as MESSAGES } from "../../src/constants/discoverScreen";
import DiscoverScreen from "../../src/features/discover/DiscoverScreen";

export default function DiscoverRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <DiscoverScreen />
    </>
  );
}
