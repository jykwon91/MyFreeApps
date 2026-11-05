import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualDetailScreen from "../../../src/features/welcomeManuals/WelcomeManualDetailScreen";

export default function WelcomeManualRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Manual", headerBackTitle: "Manuals" }} />
      <WelcomeManualDetailScreen id={id} />
    </>
  );
}
