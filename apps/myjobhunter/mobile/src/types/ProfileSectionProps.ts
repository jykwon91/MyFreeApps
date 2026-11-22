import type { ProfileListState } from "@myjobhunter/api-client/types/profile-list/profile-list-state";

/** A profile list section, given its list. */
export interface ProfileSectionProps<Item> {
  state: ProfileListState<Item>;
}
