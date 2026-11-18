import { Stack, useLocalSearchParams } from "expo-router";
import MortgageDetailScreen from "../../../../src/features/mortgages/MortgageDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function MortgageRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Mortgage", headerBackTitle: "Mortgages" }} />
      <ValidRoute uuids={["id"]}>
        <MortgageDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
