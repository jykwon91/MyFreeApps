/** Whether the phone's owner confirmed it, and what to show if it couldn't ask. */
export interface OwnerCheck {
  confirmed: boolean;
  problem: string | null;
}
