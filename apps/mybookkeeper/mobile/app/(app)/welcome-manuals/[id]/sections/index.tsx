import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualSectionsScreen from "../../../../../src/features/welcomeManuals/WelcomeManualSectionsScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function WelcomeManualSectionsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Sections", headerBackTitle: "Manual" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualSectionsScreen id={id} />
      </ValidRoute>
    </>
  );
}
