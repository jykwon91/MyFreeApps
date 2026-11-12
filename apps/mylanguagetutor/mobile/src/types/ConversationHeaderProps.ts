import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";

export interface ConversationHeaderProps {
  scenario: Scenario;
  /** 0-based indexes of the goals already met. */
  goalsMet: number[];
}
