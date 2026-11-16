import { MapPin, ScrollText } from "lucide-react";
import { Link } from "react-router-dom";
import PickupRow from "@/games/wow-forever/components/dungeons/beforeYouGo/PickupRow";
import QuestLineStatusLine from "@/games/wow-forever/components/dungeons/beforeYouGo/QuestLineStatusLine";
import { DETAIL_CHIP, DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { BEFORE_YOU_GO_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { questClassesText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { idsDoneWith, idsUndoneWith, questLineStatus } from "@/games/wow-forever/lib/dungeons/questLineProgress";
import { continentPickupLinks } from "@/games/wow-forever/lib/dungeons/questPickupsMapLinks";
import type { QuestLine } from "@/games/wow-forever/types/dungeons/questLine";
import type { WorldZone } from "@/games/wow-forever/types/worldMap";

interface QuestLineCardProps {
  line: QuestLine;
  zones: readonly WorldZone[];
  done: ReadonlySet<number>;
  setDone: (ids: readonly number[], value: boolean) => void;
}

/**
 * One line: its dungeon quest(s) (and class), where you are in it, a World Map
 * link marking its givers, then each step with a done checkbox.
 */
export default function QuestLineCard({ line, zones, done, setDone }: QuestLineCardProps) {
  const links = continentPickupLinks(line.steps, zones);
  const status = questLineStatus(line, done);
  const toggle = (index: number) => {
    const isDone = done.has(line.steps[index].id);
    setDone(isDone ? idsUndoneWith(line, index) : idsDoneWith(line, index), !isDone);
  };
  return (
    <div className="space-y-1.5 rounded-lg border p-3" data-testid="quest-line" data-quest-id={line.id}>
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <ScrollText className="h-4 w-4 text-primary" aria-hidden />
        {line.titles.join(" · ")}
        {line.classes.length > 0 ? <span className={DETAIL_CHIP}>{BEFORE_YOU_GO_COPY.classOnly(questClassesText(line))}</span> : null}
        {line.steps.length > 1 ? (
          <span className="font-normal text-muted-foreground">· {BEFORE_YOU_GO_COPY.steps(line.steps.length)}</span>
        ) : null}
      </h3>
      <QuestLineStatusLine line={line} status={status} />
      {links.map((link) => (
        <Link key={link.mapName} to={link.href} className={DETAIL_LINK} data-testid="quest-line-map-link">
          <MapPin className="h-4 w-4" aria-hidden />
          {BEFORE_YOU_GO_COPY.showLine(link.count, link.mapName)}
        </Link>
      ))}
      <ol className="space-y-0.5">
        {line.steps.map((step, i) => (
          <PickupRow
            key={step.id}
            pickup={step}
            step={i + 1}
            done={done.has(step.id)}
            next={status.nextIndex === i}
            onToggle={() => toggle(i)}
          />
        ))}
      </ol>
    </div>
  );
}
