import { Link } from "react-router-dom";
import { questPageHref } from "@/games/wow-forever/lib/quests/questPageHref";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";

/** The quests before this one, in order, ending with this one — with links to their detail pages. */
export default function QuestChainLinks({ quest }: { quest: Pick<DungeonQuest, "id" | "chain" | "title" | "level"> }) {
  return (
    <ol className="list-decimal space-y-0.5 pl-6 text-sm" data-testid="quest-chain-links">
      {quest.chain.map((step) => (
        <li key={step.id}>
          <Link to={questPageHref(step.id)} className="text-primary hover:underline">
            {step.title}
          </Link>{" "}
          <span className="text-muted-foreground">
            · level {step.level}
            {step.giver ? ` · from ${step.giver}` : ""}
          </span>
        </li>
      ))}
      <li className="font-medium" aria-current="step">
        {quest.title} <span className="font-normal text-muted-foreground">· this quest</span>
      </li>
    </ol>
  );
}
