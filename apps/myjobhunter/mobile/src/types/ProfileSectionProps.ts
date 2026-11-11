import type { ProfileListState } from "./ProfileListState";

/** A profile list section, given its list. */
export interface ProfileSectionProps<Item> {
  state: ProfileListState<Item>;
}
