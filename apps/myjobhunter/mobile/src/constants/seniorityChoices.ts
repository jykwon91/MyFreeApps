import { SENIORITY_OPTIONS } from "@myjobhunter/api-client/constants/seniorityOptions";
import type { Seniority } from "@myjobhunter/api-client/types/profile/seniority";
import type { SheetOption } from "@platform/mobile";
import { PROFILE_MESSAGES } from "./profile";

/** The About-you sheet's levels, led by "Not set". */
export const SENIORITY_CHOICES: readonly SheetOption<Seniority | "">[] = [{ value: "", label: PROFILE_MESSAGES.seniorityNotSet }, ...SENIORITY_OPTIONS];
