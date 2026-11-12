import { Link } from "react-router-dom";
import { AlertBox } from "@platform/ui";
import { SESSION_BLOCK_CAN_START_NEW, SESSION_BLOCK_COPY } from "@mylanguagetutor/api-client/constants/sessionBlockCopy";
import type { SessionBlock } from "@mylanguagetutor/api-client/types/session/session-block";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";

interface SessionBlockNoticeProps {
  block: SessionBlock;
}

/** Why the learner can't send another turn -- not an error to retry. */
export default function SessionBlockNotice({ block }: SessionBlockNoticeProps) {
  return (
    <AlertBox variant="info">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{SESSION_BLOCK_COPY[block]}</span>
        {SESSION_BLOCK_CAN_START_NEW[block] && (
          <Link to="/scenarios" className="inline-flex min-h-[44px] items-center font-medium underline">
            {PRACTICE_COPY.pickScenario}
          </Link>
        )}
      </div>
    </AlertBox>
  );
}
