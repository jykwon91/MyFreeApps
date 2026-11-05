import { Stack } from "expo-router";
import WelcomeManualsScreen from "../../../src/features/welcomeManuals/WelcomeManualsScreen";

export default function WelcomeManualsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Welcome Manuals", headerBackTitle: "More" }} />
      <WelcomeManualsScreen />
    </>
  );
}
