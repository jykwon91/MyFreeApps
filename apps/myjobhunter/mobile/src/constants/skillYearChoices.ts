import { SKILL_YEAR_OPTIONS } from "@myjobhunter/api-client/constants/skillYearOptions";
import type { SheetOption } from "@platform/mobile";
import { SKILL_MESSAGES } from "./profileSkills";

/** The add-skill sheet's years, led by "Not set". */
export const SKILL_YEAR_CHOICES: readonly SheetOption<string>[] = [{ value: "", label: SKILL_MESSAGES.yearsNotSet }, ...SKILL_YEAR_OPTIONS];
