import clsx from "clsx";
import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { placeLabel } from "@/games/wow-forever/food/recipeSources";
import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { CraftSpecRecord } from "@/games/wow-forever/types/crafting";
import type { CraftingSpecChoice } from "@/games/wow-forever/types/craftingSpecs";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftSpecChoiceItemProps {
  choice: CraftingSpecChoice;
  /** The generated record for it (Forever name, Classic quests). */
  record: CraftSpecRecord | undefined;
  sources: SourceLookup;
  faction: PlayerFaction;
  chosen: boolean;
}

/** One specialization at the fork: what it's for and how Classic teaches it — the quest for your faction, with directions. */
export default function CraftSpecChoiceItem({ choice, record, sources, faction, chosen }: CraftSpecChoiceItemProps) {
  const quests = (record?.quests ?? []).flatMap((q) => {
    const quest = sources.quest(q.id);
    return quest && (quest.side === "N" || quest.side === faction) ? [{ ...q, quest }] : [];
  });
  return (
    <li className={clsx("rounded-lg border bg-card p-3 space-y-1.5", chosen && "border-primary")} data-testid={`spec-${choice.id}`}>
      <p className="font-medium">
        {record?.name ?? choice.label}
        {chosen ? <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">Your choice</span> : null}
      </p>
      <p className="text-sm text-muted-foreground">{choice.summary}</p>
      {choice.howTo.kind === "quests"
        ? quests.map(({ id, skill, level, items, quest }) => {
            const giver = quest.givers[0];
            return (
              <div key={id} className="space-y-0.5 text-sm">
                <p>
                  Classic quest <span className="font-medium">“{quest.title}”</span>{" "}
                  <span className="text-muted-foreground">
                    (skill {skill}, level {level})
                  </span>
                  {giver ? ` from ${giver.name}, ${placeLabel(giver)}` : ""}.
                </p>
                <p className="text-xs text-muted-foreground">Hand in: {items.map((i) => `${i.count} ${i.name}`).join(", ")}.</p>
                {giver ? <FoodDirectionsLink spot={giver} name={giver.name} /> : null}
              </div>
            );
          })
        : null}
      {choice.howTo.kind === "note" ? (
        <div className="space-y-0.5 text-sm">
          <p>{choice.howTo.text}</p>
          {choice.howTo.spot ? <FoodDirectionsLink spot={choice.howTo.spot} name={choice.howTo.spot.label} /> : null}
        </div>
      ) : null}
    </li>
  );
}
