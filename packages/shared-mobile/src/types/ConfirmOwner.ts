/** Face ID, fingerprint or passcode. `problem` is what to show if it couldn't ask. */
export type ConfirmOwner = () => Promise<{ confirmed: boolean; problem: string | null }>;
