import type { ConfirmOwner } from "@platform/mobile";
import { SECURITY_CHANGE_PROMPT } from "../../constants/security";
import { confirmOwner } from "../../lib/confirmOwner";

export const confirmSecurityChange: ConfirmOwner = () => confirmOwner(SECURITY_CHANGE_PROMPT);
