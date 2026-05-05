/**
 * Discriminated union for what ClassificationRulesPanel body should render.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type ClassificationRulesPanelMode = "loading" | "empty" | "list";
