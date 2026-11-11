import type { ReactNode } from "react";
import type { ProfileListState } from "./ProfileListState";

export interface ProfileListSectionProps<Item> {
  title: string;
  state: ProfileListState<Item>;
  /** For screen readers, while the list loads. */
  loadingLabel: string;
  couldntLoad: string;
  tryAgain: string;
  emptyHeading: string;
  emptyBody: string;
  addLabel: string;
  onAdd: () => void;
  /** Says why Add can't be used, and turns it off. */
  addDisabledReason?: string;
  /** The loaded, non-empty list. */
  renderItems: (items: readonly Item[]) => ReactNode;
  testID: string;
}
