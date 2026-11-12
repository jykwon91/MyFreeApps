import type { Language } from "../catalog/language";
import type { Scenario } from "../catalog/scenario";

/** The language and scenario a practice conversation is in. */
export interface PracticeTarget {
  language: Language;
  scenario: Scenario;
}
