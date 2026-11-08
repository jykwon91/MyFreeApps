import type { RacialKind } from "@/games/wow-forever/types/races/racialKind";
import type { RacialStatus } from "@/games/wow-forever/types/races/racialStatus";
import type { RacialVariant } from "@/games/wow-forever/types/races/racialVariant";

/** One racial trait of one race. */
export interface Racial {
  /** `<race slug>-<racial slug>`: the racial's anchor on the page. Never change — it's a link. */
  key: string;
  name: string;
  kind: RacialKind;
  status: RacialStatus;
  /** Icon file data id; 0 = none. */
  icon: number;
  /** Forever's text; empty for a removed racial. */
  variants: readonly RacialVariant[];
  /** Classic Era's text, for a changed or removed racial; null otherwise. */
  classicVariants: readonly RacialVariant[] | null;
  /** Classic's name, when Forever renamed it. */
  wasName: string | null;
  /** A value in the text isn't in the game files (shown as "?"). */
  partial: boolean;
}
