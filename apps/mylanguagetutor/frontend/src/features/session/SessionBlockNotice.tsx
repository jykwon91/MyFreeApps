import { Link } from "react-router-dom";
import { AlertBox } from "@platform/ui";
import type { SessionBlock } from "@/types/session/session-block";

interface SessionBlockNoticeProps {
  block: SessionBlock;
}

const COPY: Record<SessionBlock, string> = {
  daily_limit: "You've used today's practice time. It resets tomorrow — see you then.",
  unavailable: "The tutor is taking a break right now. Please check back later.",
  session_limit: "This conversation has reached its length limit. Start a new one to keep going.",
  session_ended: "This conversation has ended. Start a new one to keep going.",
};

const CAN_START_NEW: Record<SessionBlock, boolean> = {
  daily_limit: false,
  unavailable: false,
  session_limit: true,
  session_ended: true,
};

/** Why the learner can't send another turn -- not an error to retry. */
export default function SessionBlockNotice({ block }: SessionBlockNoticeProps) {
  return (
    <AlertBox variant="info">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{COPY[block]}</span>
        {CAN_START_NEW[block] && (
          <Link to="/scenarios" className="inline-flex min-h-[44px] items-center font-medium underline">
            Pick a scenario
          </Link>
        )}
      </div>
    </AlertBox>
  );
}
