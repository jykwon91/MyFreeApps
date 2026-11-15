import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";

/** A guild member's main talent spec: the tree with the most points. */
export interface MemberSpec {
  /** Display name of the spec tree (e.g. "Affliction"). */
  name: string;
  /** Icon for `GameIcon`, or null when the file id is 0. */
  icon: WowIcon | null;
  /** Points spent in this tree. */
  points: number;
}
