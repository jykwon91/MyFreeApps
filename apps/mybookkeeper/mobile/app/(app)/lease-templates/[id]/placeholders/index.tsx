import { Stack, useLocalSearchParams } from "expo-router";
import { PLACEHOLDER_MESSAGES } from "../../../../../src/constants/leasePlaceholderEdit";
import LeaseTemplatePlaceholdersScreen from "../../../../../src/features/leaseTemplates/LeaseTemplatePlaceholdersScreen";

export default function LeaseTemplatePlaceholdersRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: PLACEHOLDER_MESSAGES.heading, headerBackTitle: "Template" }} />
      <LeaseTemplatePlaceholdersScreen id={id} />
    </>
  );
}
