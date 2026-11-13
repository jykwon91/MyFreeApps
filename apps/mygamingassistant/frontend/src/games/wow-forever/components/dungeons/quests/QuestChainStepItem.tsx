import { Link } from "react-router-dom";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { questPageHref } from "@/games/wow-forever/lib/quests/questPageHref";
import type { QuestChainStep } from "@/games/wow-forever/types/dungeons/questChainStep";

interface QuestChainStepItemProps {
  step: QuestChainStep;
  /** Link the title to the quest's own page. */
  linked: boolean;
}

/** One other quest in the line: its title, level and who gives it. */
export default function QuestChainStepItem({ step, linked }: QuestChainStepItemProps) {
  return (
    <li>
      {linked ? (
        <Link to={questPageHref(step.id)} className={DETAIL_LINK}>
          {step.title}
        </Link>
      ) : (
        step.title
      )}{" "}
      <span className="text-muted-foreground">
        · level {step.level}
        {step.giver ? ` · from ${step.giver}` : ""}
      </span>
    </li>
  );
}
