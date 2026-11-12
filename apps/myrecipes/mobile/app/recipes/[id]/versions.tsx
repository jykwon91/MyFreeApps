import { Stack } from "expo-router";
import { RECIPE_BACK_TITLE } from "../../../src/constants/backTitles";
import { VERSION_HISTORY_MESSAGES as MESSAGES } from "../../../src/constants/versions";
import VersionHistoryScreen from "../../../src/features/versions/VersionHistoryScreen";

export default function VersionHistoryRoute() {
  return (
    <>
      <Stack.Screen options={{ title: MESSAGES.screenTitle, headerBackTitle: RECIPE_BACK_TITLE }} />
      <VersionHistoryScreen />
    </>
  );
}
