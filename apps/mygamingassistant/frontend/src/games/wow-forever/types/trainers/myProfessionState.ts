import type { MyProfession } from "@/games/wow-forever/types/trainers/myProfession";

/** Your saved character, read for one crafting profession on the Trainers page. */
export type MyProfessionState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "error"; retry: () => void; retrying: boolean }
  | { kind: "not-learned"; characterName: string }
  | {
      kind: "ready";
      mine: MyProfession;
      /** ISO 8601 last log out; Blizzard's answer is as of then. */
      lastLogin: string | null;
      /** The character's faction isn't the page's: only "Known" is marked, since other trainers apply. */
      otherFaction: string | null;
    };
