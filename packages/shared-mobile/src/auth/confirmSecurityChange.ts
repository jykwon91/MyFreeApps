import { OWNER_CHECK_MESSAGES } from "../constants/ownerCheck";
import type { ConfirmOwner } from "../types/ConfirmOwner";
import { confirmOwner } from "./confirmOwner";

/** Asks before two-step sign-in is turned on or off. */
export const confirmSecurityChange: ConfirmOwner = () => confirmOwner(OWNER_CHECK_MESSAGES.securityChangePrompt);
