import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";

/** The list a share link (`#list=…`) carries; `present` is true even when the link is broken. */
export interface SharedBisListLink {
  present: boolean;
  list: SharedBisList | null;
  /** Drop the fragment (after saving, or "Back to my lists"), staying on My lists. */
  close: () => void;
}
