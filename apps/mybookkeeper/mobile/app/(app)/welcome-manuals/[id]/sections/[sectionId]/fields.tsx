import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualFieldsScreen from "../../../../../../src/features/welcomeManuals/WelcomeManualFieldsScreen";

export default function WelcomeManualFieldsRoute() {
  const { id, sectionId } = useLocalSearchParams<{ id: string; sectionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Fields", headerBackTitle: "Section" }} />
      <WelcomeManualFieldsScreen manualId={id} sectionId={sectionId} />
    </>
  );
}
