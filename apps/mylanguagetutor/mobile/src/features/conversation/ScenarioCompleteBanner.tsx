import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { Banner } from "@platform/mobile";
import { router } from "expo-router";
import { SCENARIO_COMPLETE_MESSAGE } from "../../constants/conversation";
import { PRACTICE_PATH } from "../../constants/routes";
import type { ScenarioCompleteBannerProps } from "../../types/ScenarioCompleteBannerProps";

/** Every goal is covered: the learner can keep talking or move on to the next scenario. */
export default function ScenarioCompleteBanner({ onKeepTalking }: ScenarioCompleteBannerProps) {
  return (
    <Banner
      actions={[
        { label: PRACTICE_COPY.nextScenario, onPress: () => router.dismissTo(PRACTICE_PATH) },
        { label: PRACTICE_COPY.keepTalking, onPress: onKeepTalking },
      ]}
      message={SCENARIO_COMPLETE_MESSAGE}
      tone="success"
    />
  );
}
