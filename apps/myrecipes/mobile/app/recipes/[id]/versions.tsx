import { Stack } from "expo-router";
import { RECIPE_BACK_TITLE } from "../../../src/constants/backTitles";
import { VERSION_HISTORY_MESSAGES as MESSAGES } from "../../../src/constants/versions";
import VersionHistoryScreen from "../../../src/features/versions/VersionHistoryScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function VersionHistoryRoute() {
  return (
    <>
      <Stack.Screen options={{ title: MESSAGES.screenTitle, headerBackTitle: RECIPE_BACK_TITLE }} />
      <ValidRoute uuids={["id"]}>
        <VersionHistoryScreen />
      </ValidRoute>
    </>
  );
}
