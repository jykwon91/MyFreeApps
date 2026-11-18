import { Stack, useLocalSearchParams } from "expo-router";
import MortgageEditScreen from "../../../../src/features/mortgages/MortgageEditScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function MortgageEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit mortgage", headerBackTitle: "Mortgage" }} />
      <ValidRoute uuids={["id"]}>
        <MortgageEditScreen id={id} />
      </ValidRoute>
    </>
  );
}
