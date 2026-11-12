import { Link } from "react-router-dom";
import { PartyPopper } from "lucide-react";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";

interface ScenarioCompleteBannerProps {
  onKeepTalking: () => void;
}

/** Every goal is covered. The learner can keep chatting or move on. */
export default function ScenarioCompleteBanner({ onKeepTalking }: ScenarioCompleteBannerProps) {
  return (
    <section
      className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 font-semibold">
        <PartyPopper className="h-5 w-5" aria-hidden="true" />
        <span>{PRACTICE_COPY.scenarioComplete}</span>
      </div>
      <p className="mt-1">{PRACTICE_COPY.scenarioCompleteBody}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link to="/scenarios" className="inline-flex min-h-[44px] items-center font-medium underline">
          {PRACTICE_COPY.nextScenario}
        </Link>
        <button
          type="button"
          onClick={onKeepTalking}
          className="inline-flex min-h-[44px] items-center font-medium underline"
        >
          {PRACTICE_COPY.keepTalking}
        </button>
      </div>
    </section>
  );
}
