import QuestChainStepItem from "@/games/wow-forever/components/dungeons/quests/QuestChainStepItem";
import { moreQuestsText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";

interface QuestChainProps {
  quest: Pick<DungeonQuest, "chain" | "after" | "title">;
  /** Link each other quest to its own page. */
  linked: boolean;
  /** How many of the quests after this one to list; the rest are counted. Omit to list them all. */
  afterShown?: number;
}

/** The quest's line in order: the quests before it, this one, then the quests after it. */
export default function QuestChain({ quest, linked, afterShown = quest.after.length }: QuestChainProps) {
  const next = quest.after.slice(0, afterShown);
  const more = moreQuestsText(quest.after.length - next.length);
  return (
    <div>
      <ol className="list-decimal space-y-0.5 pl-6 text-sm" data-testid="quest-chain">
        {quest.chain.map((step) => (
          <QuestChainStepItem key={step.id} step={step} linked={linked} />
        ))}
        <li className="font-medium" aria-current="step">
          {quest.title} <span className="font-normal text-muted-foreground">· this quest</span>
        </li>
        {next.map((step) => (
          <QuestChainStepItem key={step.id} step={step} linked={linked} />
        ))}
      </ol>
      {more ? (
        <p className="pl-6 text-sm text-muted-foreground" data-testid="quest-chain-more">
          {more}
        </p>
      ) : null}
    </div>
  );
}
