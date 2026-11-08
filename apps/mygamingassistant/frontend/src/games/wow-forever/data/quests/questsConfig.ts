/** Must match SHARD_COUNT in `backend/scripts/wow_quests/build.py` (a test pins both). */
export const QUEST_SHARD_COUNT = 64;

export const QUEST_PAGE_SIZE = 50;

export const QUESTS_STATUS = {
  loading: "loading",
  ready: "ready",
  error: "error",
} as const;

export type QuestsStatus = (typeof QUESTS_STATUS)[keyof typeof QUESTS_STATUS];
