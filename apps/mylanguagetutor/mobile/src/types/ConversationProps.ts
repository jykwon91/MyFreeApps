import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";
import type { Level } from "@mylanguagetutor/api-client/types/tutor/level";

export interface ConversationProps {
  language: Language;
  scenario: Scenario;
  level: Level;
}
