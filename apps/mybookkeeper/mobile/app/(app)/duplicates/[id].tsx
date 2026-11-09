import { Stack, useLocalSearchParams } from "expo-router";
import DuplicateCompareScreen from "../../../src/features/duplicates/DuplicateCompareScreen";

export default function DuplicateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Compare", headerBackTitle: "Duplicates" }} />
      <DuplicateCompareScreen id={id} />
    </>
  );
}
