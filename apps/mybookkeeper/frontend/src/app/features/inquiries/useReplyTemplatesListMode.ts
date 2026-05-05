import type { ReplyTemplatesListMode } from "@/shared/types/inquiry/reply-templates-list-mode";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";

interface UseReplyTemplatesListModeArgs {
  isLoading: boolean;
  templates: readonly ReplyTemplate[];
}

/**
 * Resolves the templates list render mode from the loaded state. Single
 * source of truth so the body component is a flat switch instead of a tower
 * of conditionals.
 */
export function useReplyTemplatesListMode({
  isLoading,
  templates,
}: UseReplyTemplatesListModeArgs): ReplyTemplatesListMode {
  if (isLoading) return "loading";
  if (templates.length === 0) return "empty";
  return "list";
}
