import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { SESSION_BLOCK_CAN_START_NEW, SESSION_BLOCK_COPY } from "@mylanguagetutor/api-client/constants/sessionBlockCopy";
import { Banner } from "@platform/mobile";
import { router } from "expo-router";
import { PRACTICE_PATH } from "../../constants/routes";
import type { SessionBlockNoticeProps } from "../../types/SessionBlockNoticeProps";

/** Why the learner can't send another turn: not an error to retry. */
export default function SessionBlockNotice({ block }: SessionBlockNoticeProps) {
  return (
    <Banner
      actions={SESSION_BLOCK_CAN_START_NEW[block] ? [{ label: PRACTICE_COPY.pickScenario, onPress: () => router.dismissTo(PRACTICE_PATH) }] : []}
      message={SESSION_BLOCK_COPY[block]}
      tone="info"
    />
  );
}
