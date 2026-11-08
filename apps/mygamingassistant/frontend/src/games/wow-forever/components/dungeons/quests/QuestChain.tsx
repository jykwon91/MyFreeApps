import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";

/** The quests before this one, in order, ending with this one. */
export default function QuestChain({ quest }: { quest: Pick<DungeonQuest, "chain" | "title" | "level"> }) {
  return (
    <ol className="list-decimal space-y-0.5 pl-6 text-sm" data-testid="quest-chain">
      {quest.chain.map((step) => (
        <li key={step.id}>
          {step.title}{" "}
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
