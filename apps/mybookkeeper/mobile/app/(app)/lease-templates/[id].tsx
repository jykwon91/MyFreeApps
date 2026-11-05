import { Stack, useLocalSearchParams } from "expo-router";
import LeaseTemplateDetailScreen from "../../../src/features/leaseTemplates/LeaseTemplateDetailScreen";

export default function LeaseTemplateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Template", headerBackTitle: "Templates" }} />
      <LeaseTemplateDetailScreen id={id} />
    </>
  );
}
