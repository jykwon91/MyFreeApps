/** Browser storage keys for "Suggest a feature". Bump the version suffix if a stored shape changes. */

/** localStorage: this browser's random voter id (a UUID). The server only ever stores an HMAC of it. */
export const VOTER_ID_STORAGE_KEY = "mga.wowForever.suggest.voter.v1";

/** localStorage: ideas this browser sent that became stories (id + title), waiting for review. */
export const MY_IDEAS_STORAGE_KEY = "mga.wowForever.suggest.mine.v1";

/** sessionStorage: the idea being written, so a failed or paused submit never loses it. */
export const SUGGESTION_DRAFT_STORAGE_KEY = "mga.wowForever.suggest.draft.v1";

/** At most this many of your own ideas are remembered. */
export const MY_IDEAS_MAX = 20;