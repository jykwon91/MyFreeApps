import type { AskDungeonCard } from "@/games/wow-forever/types/ask/askDungeonCard";
import type { AskItemsCard } from "@/games/wow-forever/types/ask/askItemsCard";
import type { AskNoResultsCard } from "@/games/wow-forever/types/ask/askNoResultsCard";
import type { AskNpcCard } from "@/games/wow-forever/types/ask/askNpcCard";
import type { AskPlacesCard } from "@/games/wow-forever/types/ask/askPlacesCard";
import type { AskWhereCard } from "@/games/wow-forever/types/ask/askWhereCard";

/** What a tool call shows under Claude's reply. Kept in the browser; Claude only sees the compact result. */
export type AskCard = AskNpcCard | AskPlacesCard | AskItemsCard | AskDungeonCard | AskWhereCard | AskNoResultsCard;
