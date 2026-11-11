export const OWNER_CHECK_MESSAGES = {
  couldntConfirm: "I couldn't confirm it's you. Want me to try again?",
  securityChangePrompt: "Change your sign-in security",
} as const;

/** The person backed out of the prompt, or the system took it away: nothing went wrong. */
export const OWNER_CHECK_QUIET_ERRORS: readonly string[] = ["user_cancel", "system_cancel", "app_cancel"];
