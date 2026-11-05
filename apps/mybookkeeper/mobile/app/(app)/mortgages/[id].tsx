import { Stack, useLocalSearchParams } from "expo-router";
import MortgageDetailScreen from "../../../src/features/mortgages/MortgageDetailScreen";

export default function MortgageRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Mortgage", headerBackTitle: "Mortgages" }} />
      <MortgageDetailScreen id={id} />
    </>
  );
}
