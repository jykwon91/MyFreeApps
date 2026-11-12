import { Stack } from "expo-router";
import { RESUME_MESSAGES as MESSAGES } from "../../src/constants/resume";
import ResumeScreen from "../../src/features/resume/ResumeScreen";

export default function ResumeRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <ResumeScreen />
    </>
  );
}
