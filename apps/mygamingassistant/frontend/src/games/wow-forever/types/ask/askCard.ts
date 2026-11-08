import type { AskDungeonCard } from "@/games/wow-forever/types/ask/askDungeonCard";
import type { AskGoldCard } from "@/games/wow-forever/types/ask/askGoldCard";
import type { AskItemsCard } from "@/games/wow-forever/types/ask/askItemsCard";
import type { AskMacrosCard } from "@/games/wow-forever/types/ask/askMacrosCard";
import type { AskNoResultsCard } from "@/games/wow-forever/types/ask/askNoResultsCard";
import type { AskNpcCard } from "@/games/wow-forever/types/ask/askNpcCard";
import type { AskPlacesCard } from "@/games/wow-forever/types/ask/askPlacesCard";
import type { AskPricesCard } from "@/games/wow-forever/types/ask/askPricesCard";
import type { AskProfessionCard } from "@/games/wow-forever/types/ask/askProfessionCard";
import type { AskRaresCard } from "@/games/wow-forever/types/ask/askRaresCard";
import type { AskServerStatusCard } from "@/games/wow-forever/types/ask/askServerStatusCard";
import type { AskWhereCard } from "@/games/wow-forever/types/ask/askWhereCard";

/** What a tool call shows under Claude's reply. Kept in the browser; Claude only sees the compact result. */
export type AskCard =
  | AskNpcCard
  | AskPlacesCard
  | AskItemsCard
  | AskDungeonCard
  | AskWhereCard
  | AskNoResultsCard
  | AskRaresCard
  | AskProfessionCard
  | AskGoldCard
  | AskMacrosCard
  | AskPricesCard
  | AskServerStatusCard;
