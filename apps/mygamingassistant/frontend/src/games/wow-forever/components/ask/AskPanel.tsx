import { AlertBox } from "@platform/ui";
import OpenInBrowserButton from "@/components/discord/OpenInBrowserButton";
import AskWithData from "@/games/wow-forever/components/ask/AskWithData";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import {
  isHumanCheckedFeatureBrowserOnly,
  isHumanCheckedFeatureOffered,
} from "@/games/wow-forever/lib/humanCheckAvailability";

interface AskPanelProps {
  initialQuestion: string | null;
}

/**
 * The chat — or why it can't run here: a public build without the human
 * check (no site key), or the Discord Activity, which can't show it.
 */
export default function AskPanel({ initialQuestion }: AskPanelProps) {
  if (!isHumanCheckedFeatureOffered()) return <AlertBox variant="info">{ASK_COPY.disabled}</AlertBox>;
  if (isHumanCheckedFeatureBrowserOnly()) {
    return (
      <AlertBox variant="info">
        <div className="space-y-2">
          <p>{ASK_COPY.browserOnly}</p>
          <OpenInBrowserButton />
        </div>
      </AlertBox>
    );
  }
  return <AskWithData initialQuestion={initialQuestion} />;
}
