import type { Profile } from "../profile/profile";

/** What `useDiscoveryDefaultsPrefill` gives the new-saved-search form. */
export interface DiscoveryPrefill {
  /** For reading and merging `discovery_defaults` when saving them. */
  profile: Profile | undefined;
  /** The latest distinct job titles from work history. */
  recentRoleSuggestions: string[];
  /** The first few profile skills. */
  skillSuggestions: string[];
  /** True while the profile, skills or work history is loading. */
  isPrefillLoading: boolean;
  /** True once the form has been filled from the profile, for this opening. */
  didPrefill: boolean;
  /** Lets the next opening fill the form again. */
  resetPrefill: () => void;
}

