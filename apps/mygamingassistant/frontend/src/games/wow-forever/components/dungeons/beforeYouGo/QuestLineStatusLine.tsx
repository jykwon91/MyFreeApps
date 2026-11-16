import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react";
import { BEFORE_YOU_GO_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import type { QuestLine } from "@/games/wow-forever/types/dungeons/questLine";
import type { QuestLineStatus } from "@/games/wow-forever/types/dungeons/questLineStatus";

/** "Not started", "Next: step 3 of 7 — …" or "All done", with an icon. */
export default function QuestLineStatusLine({ line, status }: { line: QuestLine; status: QuestLineStatus }) {
  if (status.nextIndex === null) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-300" data-testid="quest-line-status">
        <CircleCheck className="h-4 w-4" aria-hidden />
        {BEFORE_YOU_GO_COPY.allDone}
      </p>
    );
  }
  const next = line.steps[status.nextIndex];
  const where = next.giver ? BEFORE_YOU_GO_COPY.from(next.giver.name, next.giver.place?.zoneName ?? null) : "";
  const Icon = status.doneCount === 0 ? CircleDashed : ArrowRight;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="quest-line-status">
      <Icon className="h-4 w-4 text-primary" aria-hidden />
      <span>
        <span className="font-medium">{status.doneCount === 0 ? BEFORE_YOU_GO_COPY.notStarted : BEFORE_YOU_GO_COPY.next}</span>{" "}
        {BEFORE_YOU_GO_COPY.stepOf(status.nextIndex + 1, line.steps.length)} · {next.title}
        {where}
      </span>
    </p>
  );
}
