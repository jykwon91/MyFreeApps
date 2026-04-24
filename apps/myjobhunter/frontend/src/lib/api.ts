// Re-export the shared axios instance so app code imports from here, not directly
// from @platform/ui. The shared instance already handles auth headers + 401 logic.
export { default } from "@platform/ui/lib/api";
