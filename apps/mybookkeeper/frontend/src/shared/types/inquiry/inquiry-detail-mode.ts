/**
 * Discriminated union for what the InquiryDetail body should render.
 * Replaces the nested isLoading / isError / content ternary chain with a flat switch.
 */
export type InquiryDetailMode = "loading" | "content";
