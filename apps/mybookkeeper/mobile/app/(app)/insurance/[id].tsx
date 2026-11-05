import { Stack, useLocalSearchParams } from "expo-router";
import PolicyDetailScreen from "../../../src/features/insurance/PolicyDetailScreen";

export default function PolicyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Policy", headerBackTitle: "Insurance" }} />
      <PolicyDetailScreen id={id} />
    </>
  );
}
