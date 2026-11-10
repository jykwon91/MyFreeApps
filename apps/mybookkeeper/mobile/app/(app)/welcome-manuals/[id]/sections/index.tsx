import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualSectionsScreen from "../../../../../src/features/welcomeManuals/WelcomeManualSectionsScreen";

export default function WelcomeManualSectionsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Sections", headerBackTitle: "Manual" }} />
      <WelcomeManualSectionsScreen id={id} />
    </>
  );
}
