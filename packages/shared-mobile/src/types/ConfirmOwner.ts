import type { OwnerCheck } from "./OwnerCheck";

/** Face ID, fingerprint or passcode. `problem` is what to show if it couldn't ask. */
export type ConfirmOwner = () => Promise<OwnerCheck>;
