import { Stack, useLocalSearchParams } from "expo-router";
import MortgageEditScreen from "../../../../src/features/mortgages/MortgageEditScreen";

export default function MortgageEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit mortgage", headerBackTitle: "Mortgage" }} />
      <MortgageEditScreen id={id} />
    </>
  );
}
