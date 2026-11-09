import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualSectionEditScreen from "../../../../../../src/features/welcomeManuals/WelcomeManualSectionEditScreen";

export default function WelcomeManualSectionEditRoute() {
  const { id, sectionId } = useLocalSearchParams<{ id: string; sectionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit section", headerBackTitle: "Section" }} />
      <WelcomeManualSectionEditScreen manualId={id} sectionId={sectionId} />
    </>
  );
}
