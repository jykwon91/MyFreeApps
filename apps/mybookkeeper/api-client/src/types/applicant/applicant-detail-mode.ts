/**
 * Discriminated union for what ApplicantDetailBody should render.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type ApplicantDetailMode = "loading" | "content";
