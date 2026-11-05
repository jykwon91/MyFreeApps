import { useSearchParams } from "react-router-dom";
import { REPLY_TEMPLATES_VIEW_PARAM } from "@/shared/lib/reply-template-constants";
import type { ReplyTemplatesView } from "@/shared/types/inquiry/reply-templates-view";

/** The tab lives in the URL so the archived list can be linked to and survives a reload. */
export function useReplyTemplatesView(): [ReplyTemplatesView, (next: ReplyTemplatesView) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: ReplyTemplatesView = searchParams.get(REPLY_TEMPLATES_VIEW_PARAM) === "archived" ? "archived" : "active";

  function setView(next: ReplyTemplatesView) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === "archived") params.set(REPLY_TEMPLATES_VIEW_PARAM, "archived");
        else params.delete(REPLY_TEMPLATES_VIEW_PARAM);
        return params;
      },
      { replace: true },
    );
  }

  return [view, setView];
}
