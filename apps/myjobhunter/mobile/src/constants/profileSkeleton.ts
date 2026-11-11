/** The job preferences' facts while they load: salary and work authorization. */
export const PREFERENCE_SKELETON_FACTS = ["salary", "work-auth"] as const;

/** The remote preference's four choices while they load. */
export const REMOTE_SKELETON_ROWS = ["remote", "hybrid", "onsite", "any"] as const;

/** The list sections under the preferences, in the order the loaded screen shows them. */
export const PROFILE_SKELETON_SECTIONS = ["work-history", "education", "skills", "screening"] as const;
