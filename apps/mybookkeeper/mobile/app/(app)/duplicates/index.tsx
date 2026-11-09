import { Stack } from "expo-router";
import DuplicatesScreen from "../../../src/features/duplicates/DuplicatesScreen";

export default function DuplicatesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Possible duplicates", headerBackTitle: "Money" }} />
      <DuplicatesScreen />
    </>
  );
}
