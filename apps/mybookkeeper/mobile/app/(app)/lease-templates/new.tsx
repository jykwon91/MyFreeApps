import { Stack } from "expo-router";
import LeaseTemplateCreateScreen from "../../../src/features/leaseTemplates/LeaseTemplateCreateScreen";

export default function NewLeaseTemplateRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New template", headerBackTitle: "Templates" }} />
      <LeaseTemplateCreateScreen />
    </>
  );
}
