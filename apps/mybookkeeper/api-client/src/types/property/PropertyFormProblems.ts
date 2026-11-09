import type { PropertyForm } from "./PropertyForm";

export type PropertyFormProblems = Partial<Record<keyof PropertyForm, string>>;
