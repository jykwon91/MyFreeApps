import type { EmptyStateProps } from "@platform/mobile";

/** Copy and a way out for a screen whose own wording says more than the shared default. */
export type ViewOnlyStateProps = Partial<Pick<EmptyStateProps, "heading" | "body" | "action">>;
