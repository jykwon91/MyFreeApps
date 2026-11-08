import DungeonCard from "@/games/wow-forever/components/ask/cards/DungeonCard";
import ItemsCard from "@/games/wow-forever/components/ask/cards/ItemsCard";
import NoResultsCard from "@/games/wow-forever/components/ask/cards/NoResultsCard";
import NpcResultsCard from "@/games/wow-forever/components/ask/cards/NpcResultsCard";
import PlacesCard from "@/games/wow-forever/components/ask/cards/PlacesCard";
import WhereAreYouCard from "@/games/wow-forever/components/ask/cards/WhereAreYouCard";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { AskToolDataState } from "@/games/wow-forever/types/ask/askToolDataState";

interface AskCardViewProps {
  card: AskCard;
  tools: AskToolDataState;
}

/** One tool call's result, as its card. */
export default function AskCardView({ card, tools }: AskCardViewProps) {
  switch (card.kind) {
    case ASK_CARD.npcs:
      return <NpcResultsCard card={card} />;
    case ASK_CARD.places:
      return <PlacesCard card={card} />;
    case ASK_CARD.items:
      return <ItemsCard card={card} />;
    case ASK_CARD.dungeon:
      return <DungeonCard card={card} />;
    case ASK_CARD.where:
      return <WhereAreYouCard tools={tools} />;
    case ASK_CARD.noResults:
      return <NoResultsCard card={card} />;
  }
}
